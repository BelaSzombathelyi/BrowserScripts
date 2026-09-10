#!/usr/bin/env python3
"""Synchronizes the 'references' folder from iCloud /UserScripts/references into the local 'references' directory.

This script uses the same session and credentials management as upload_to_icloud.py,
keeping a local state.json database with downloaded files' size and modification dates
to only download new or modified webarchive files.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
VENDORED_ICLOUDPY = PROJECT_DIR / "vendor" / "icloudpy"
LOCAL_REFERENCES_DIR = PROJECT_DIR / "references"
STATE_FILE = LOCAL_REFERENCES_DIR / "state.json"

if VENDORED_ICLOUDPY.is_dir():
    sys.path.insert(0, str(VENDORED_ICLOUDPY))

try:
    try:
        from icloudpy import ICloudPyService as PyiCloudService
    except ImportError:
        from icloudpy import PyiCloudService
except ImportError as error:
    raise SystemExit(
        "Az icloudpy nincs telepítve vagy nem megfelelő. Először futtasd: "
        "py -m pip install -r vendor/icloudpy/requirements.txt"
    ) from error

# Reuse credential helpers from the upload script
try:
    from upload_to_icloud import get_apple_id, get_apple_password, save_apple_id, save_apple_password, authenticate
except ImportError:
    # Fallback to direct imports if import fails
    import getpass
    
    def get_apple_id() -> tuple[str, bool]:
        apple_id = os.environ.get("ICLOUD_APPLE_ID") or input("Apple ID e-mail: ").strip()
        if not apple_id:
            raise SystemExit("Apple ID szükséges.")
        return apple_id, False
        
    def get_apple_password(apple_id: str) -> tuple[str, bool]:
        password = os.environ.get("ICLOUD_PASSWORD") or getpass.getpass("Apple ID-jelszó: ")
        if not password:
            raise SystemExit("A jelszó megadása kötelező.")
        return password, False

    def save_apple_id(apple_id: str) -> None: pass
    def save_apple_password(apple_id: str, password: str) -> None: pass

    def authenticate(apple_id: str, password: str, session_dir: Path) -> Any:
        session_dir.mkdir(parents=True, exist_ok=True)
        api = PyiCloudService(apple_id, password, cookie_directory=str(session_dir))
        if api.requires_2fa:
            try:
                api.trigger_2fa_push_notification()
            except AttributeError:
                pass
            code = input("Írd be az Apple által küldött 2FA-kódot: ").strip()
            if not api.validate_2fa_code(code):
                raise RuntimeError("Érvénytelen vagy elutasított 2FA-kód.")
            if not api.is_trusted_session:
                api.trust_session()
        return api


def load_state() -> dict[str, dict[str, Any]]:
    """Loads the synchronization state database."""
    if not STATE_FILE.is_file():
        return {}
    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Figyelem: Nem sikerült beolvasni a state.json-t ({e}). Új adatbázis indul.")
        return {}


def save_state(state: dict[str, dict[str, Any]]) -> None:
    """Saves the synchronization state database."""
    LOCAL_REFERENCES_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with STATE_FILE.open("w", encoding="utf-8") as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Hiba történt a state.json mentésekor: {e}")


def get_folder_by_path(root: Any, path_str: str) -> Any | None:
    """Walks the iCloud drive node to resolve a folder path."""
    current = root
    for component in (part for part in path_str.split("/") if part):
        try:
            current = current[component]
        except (KeyError, TypeError):
            return None
    return current


def sync_node(iCloud_node: Any, local_dir: Path, state: dict[str, dict[str, Any]], remote_rel_path: str = "") -> None:
    """Recursively synchronizes directory nodes and their files."""
    local_dir.mkdir(parents=True, exist_ok=True)
    try:
        children = iCloud_node.dir()
    except Exception as e:
        print(f"Nem sikerült beolvasni az iCloud mappát ({remote_rel_path}): {e}")
        return

    for name in children:
        child_node = iCloud_node[name]
        is_dir = child_node.type == "folder"
        child_rel_path = f"{remote_rel_path}/{name}" if remote_rel_path else name

        if is_dir:
            sync_node(child_node, local_dir / name, state, child_rel_path)
        else:
            # We are interested in .webarchive files only
            if not name.lower().endswith(".webarchive"):
                continue
            local_file_path = local_dir / name
            
            # Fetch iCloud file properties
            remote_size = child_node.size
            # Convert python datetime or string safely
            try:
                remote_mtime = str(child_node.date_modified)
            except AttributeError:
                remote_mtime = ""

            # Check if we should download
            db_entry = state.get(child_rel_path)
            needs_download = False

            if not local_file_path.is_file():
                needs_download = True
            elif not db_entry:
                needs_download = True
            elif db_entry.get("size") != remote_size or db_entry.get("date_modified") != remote_mtime:
                needs_download = True

            if needs_download:
                print(f"Letöltés: {child_rel_path} ({remote_size} bytes)...")
                try:
                    with child_node.open(stream=True) as response:
                        with local_file_path.open("wb") as file_out:
                            # Read in chunks
                            for chunk in response.iter_content(chunk_size=1024*64):
                                if chunk:
                                    file_out.write(chunk)
                    
                    # Update local state record
                    state[child_rel_path] = {
                        "size": remote_size,
                        "date_modified": remote_mtime,
                        "downloaded_at": str(Path(local_file_path).stat().st_mtime)
                    }
                except Exception as e:
                    print(f"Sikertelen letöltés ({child_rel_path}): {e}")
            else:
                pass


def main() -> None:
    session_dir = Path(os.environ.get("ICLOUD_SESSION_DIR", Path.home() / ".icloudpy-sessions"))
    
    # Authenticate using existing credentials helper
    apple_id, id_from_keyring = get_apple_id()
    password, password_from_keyring = get_apple_password(apple_id)

    print("Hitelesítés az iCloud-ban...")
    try:
        api = authenticate(apple_id, password, session_dir.expanduser())
    except Exception as e:
        raise SystemExit(f"Hitelesítési hiba: {e}")

    if not id_from_keyring:
        save_apple_id(apple_id)
    if not password_from_keyring:
        save_apple_password(apple_id, password)

    # Resolve remote target folder
    remote_path = "/UserScripts/references"
    print(f"iCloud mappa csatlakoztatása ({remote_path})...")
    remote_folder = get_folder_by_path(api.drive, remote_path)
    
    if remote_folder is None:
        # Create directories if they do not exist
        print(f"Az iCloud-on a '{remote_path}' mappa nem található, ellenőrizd vagy hozd létre.")
        return

    # Load sync state
    state = load_state()

    print("Szinkronizáció indítása...")
    sync_node(remote_folder, LOCAL_REFERENCES_DIR, state)
    
    # Save the updated database
    save_state(state)
    print("Szinkronizáció befejeződött!")


if __name__ == "__main__":
    # Workaround for resolving imports from the sibling/parent path cleanly
    sys.path.insert(0, str(SCRIPT_DIR))
    main()
