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

    apple_id = os.environ.get("ICLOUD_APPLE_ID") or input("Apple ID e-mail: ").strip()
    password = os.environ.get("ICLOUD_PASSWORD") or getpass.getpass("Apple ID-jelszó: ")
    if not apple_id or not password:
        raise SystemExit("Apple ID és jelszó szükséges.")

    api = authenticate(apple_id, password, args.session_dir.expanduser())
    target_folder = get_or_create_folder(api.drive, args.destination)
    with source.open("rb") as file_in:
        target_folder.upload(file_in)
    print(f"Feltöltve: {source.name} -> {args.destination.rstrip('/')}/{source.name}")


if __name__ == "__main__":
    main()
