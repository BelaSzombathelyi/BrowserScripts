#!/usr/bin/env python3
"""Upload one local file to an iCloud Drive folder through icloudpy.

The Apple ID credentials are deliberately read only from environment variables.
The authenticated session lives outside the repository so it cannot be committed.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
VENDORED_ICLOUDPY = PROJECT_DIR / "vendor" / "icloudpy"

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


def get_or_create_folder(root: Any, remote_dir: str) -> Any:
    """Walk an absolute iCloud Drive path, creating missing folders."""
    current = root
    for component in (part for part in remote_dir.split("/") if part):
        try:
            current = current[component]
        except (KeyError, TypeError):
            current.mkdir(component)
            current = current[component]
    return current


def authenticate(apple_id: str, password: str, session_dir: Path) -> Any:
    session_dir.mkdir(parents=True, exist_ok=True)
    api = PyiCloudService(
        apple_id,
        password,
        cookie_directory=str(session_dir),
    )

    if api.requires_2fa:
        # Apple's current auth flow requires an explicit trusted-device request
        # before it will push a code. Merely detecting the 2FA requirement is
        # not enough to make an iPhone notification appear.
        try:
            notification_sent = api.trigger_2fa_push_notification()
        except AttributeError as error:
            raise RuntimeError(
                "Az icloudpy ezen verziója nem tud 2FA-push értesítést kérni. "
                "Frissítsd a vendor/icloudpy submodule-t a legújabb verzióra."
            ) from error
        if not notification_sent:
            raise RuntimeError(
                "Az Apple nem fogadta el a 2FA-push értesítés kérését. "
                "Ellenőrizd az internetkapcsolatot, majd indítsd újra a scriptet."
            )
        print("Apple 2FA-értesítés elküldve a megbízható eszközökre.")
        code = input("Írd be az Apple által küldött 2FA-kódot: ").strip()
        if not api.validate_2fa_code(code):
            raise RuntimeError("Érvénytelen vagy elutasított 2FA-kód.")
        if not api.is_trusted_session:
            api.trust_session()
    elif api.requires_2sa:
        devices = api.trusted_devices
        if not devices:
            raise RuntimeError("Nincs használható megbízható eszköz a 2 lépcsős hitelesítéshez.")
        if not api.send_verification_code(devices[0]):
            raise RuntimeError("Az Apple nem tudta elküldeni az ellenőrző kódot.")
        code = input("Írd be az Apple által küldött ellenőrző kódot: ").strip()
        if not api.validate_verification_code(devices[0], code):
            raise RuntimeError("Érvénytelen vagy elutasított ellenőrző kód.")
    return api


def get_apple_password(apple_id: str) -> tuple[str, bool]:
    """Retrieves the Apple ID password from env, local keyring, or interactive prompt.

    Returns:
        tuple[str, bool]: A tuple containing the password and a boolean indicating
                           whether the password was retrieved from the local keyring.
    """
    password = os.environ.get("ICLOUD_PASSWORD")
    if password:
        return password, False

    try:
        import keyring
        password = keyring.get_password("icloudpy", apple_id)
        if password:
            print("Jelszó sikeresen betöltve a helyi Credential Managerből.")
            return password, True
    except Exception:
        pass

    password = getpass.getpass("Apple ID-jelszó: ")
    if not password:
        raise SystemExit("A jelszó megadása kötelező.")

    return password, False


def save_apple_password(apple_id: str, password: str) -> None:
    """Saves the Apple ID password in the local keyring database."""
    if os.environ.get("ICLOUD_PASSWORD"):
        return
    try:
        import keyring
        keyring.set_password("icloudpy", apple_id, password)
        print("Jelszó biztonságosan elmentve a helyi Credential Managerbe.")
    except Exception as e:
        print(f"Nem sikerült menteni a jelszót a Credential Managerbe: {e}")


def get_apple_id() -> tuple[str, bool]:
    """Retrieves the Apple ID from env, local keyring, or interactive prompt.

    Returns:
        tuple[str, bool]: A tuple containing the Apple ID email and a boolean indicating
                           whether it was retrieved from the local keyring.
    """
    apple_id = os.environ.get("ICLOUD_APPLE_ID")
    if apple_id:
        return apple_id, False

    try:
        import keyring
        apple_id = keyring.get_password("icloudpy_config", "last_apple_id")
        if apple_id:
            print(f"Apple ID betöltve a helyi Credential Managerből: {apple_id}")
            return apple_id, True
    except Exception:
        pass

    apple_id = input("Apple ID e-mail: ").strip()
    if not apple_id:
        raise SystemExit("Apple ID szükséges.")

    return apple_id, False


def save_apple_id(apple_id: str) -> None:
    """Saves the Apple ID in the local keyring database."""
    if os.environ.get("ICLOUD_APPLE_ID"):
        return
    try:
        import keyring
        keyring.set_password("icloudpy_config", "last_apple_id", apple_id)
        print("Apple ID biztonságosan elmentve a helyi Credential Managerbe.")
    except Exception as e:
        print(f"Nem sikerült menteni az Apple ID-t a Credential Managerbe: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Helyi fájl feltöltése iCloud Drive-ba.")
    parser.add_argument("source", type=Path, help="A feltöltendő helyi fájl")
    parser.add_argument(
        "destination",
        help="Cél iCloud Drive-könyvtár, például /Documents/Garmin",
    )
    parser.add_argument(
        "--session-dir",
        type=Path,
        default=Path(os.environ.get("ICLOUD_SESSION_DIR", Path.home() / ".icloudpy-sessions")),
        help="Helyi, perzisztens session-könyvtár (alapértelmezés: ~/.icloudpy-sessions)",
    )
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"A forrásfájl nem található: {source}")

    apple_id, id_from_keyring = get_apple_id()

    password, password_from_keyring = get_apple_password(apple_id)

    api = authenticate(apple_id, password, args.session_dir.expanduser())
    
    if not id_from_keyring:
        save_apple_id(apple_id)

    if not password_from_keyring:
        save_apple_password(apple_id, password)
    target_folder = get_or_create_folder(api.drive, args.destination)
    with source.open("rb") as file_in:
        target_folder.upload(file_in)
    print(f"Feltöltve: {source.name} -> {args.destination.rstrip('/')}/{source.name}")


if __name__ == "__main__":
    main()
