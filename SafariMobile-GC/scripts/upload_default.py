#!/usr/bin/env python3
"""Directly uploads GC.user.js to /UserScripts in iCloud Drive with pre-filled arguments.

This simplifies the interface and optimizes tokens required to invoke and run the script.
"""

import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
UPLOAD_SCRIPT = SCRIPT_DIR / "upload_to_icloud.py"
SOURCE_FILE = PROJECT_DIR / "GC.user.js"
DEST_DIR = "/UserScripts"

def main() -> None:
    print(f"Uploading {SOURCE_FILE.name} directly to {DEST_DIR} in iCloud...")
    cmd = [sys.executable, str(UPLOAD_SCRIPT), str(SOURCE_FILE), DEST_DIR]
    # Pass down any extra arguments (e.g. --session-dir)
    cmd.extend(sys.argv[1:])
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
