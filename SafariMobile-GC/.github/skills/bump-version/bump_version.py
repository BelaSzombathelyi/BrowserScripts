#!/usr/bin/env python3
import re
import sys
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Algorithmic version bumper for GC.user.js")
    parser.add_argument(
        "--type",
        choices=["major", "minor", "patch"],
        default="patch",
        help="Type of version increment (default: patch)"
    )
    parser.add_argument(
        "--set-version",
        help="Explicitly set the version (e.g. 3.5.7)"
    )
    parser.add_argument(
        "--file",
        default="GC.user.js",
        help="Path to the GC.user.js file"
    )
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.is_file():
        # Maybe try checking relative to project root if running from elsewhere
        # We assume the working directory is the repo root.
        print(f"Error: File '{file_path}' not found.", file=sys.stderr)
        sys.exit(1)

    content = file_path.read_text(encoding="utf-8")

    # Find the current version from the @version tag
    version_match = re.search(r"@version\s+([0-9.]+)", content)
    if not version_match:
        print("Error: Could not find @version tag in UserScript header.", file=sys.stderr)
        sys.exit(1)

    current_version = version_match.group(1)
    print(f"Current version: {current_version}")

    if args.set_version:
        new_version = args.set_version
    else:
        parts = current_version.split(".")
        if len(parts) < 3:
            parts += ["0"] * (3 - len(parts))
        
        try:
            major = int(parts[0])
            minor = int(parts[1])
            patch = int(parts[2])
        except ValueError:
            print(f"Error: Non-integer elements in version number: {current_version}", file=sys.stderr)
            sys.exit(1)

        if args.type == "major":
            major += 1
            minor = 0
            patch = 0
        elif args.type == "minor":
            minor += 1
            patch = 0
        else: # patch
            patch += 1

        new_version = f"{major}.{minor}.{patch}"

    print(f"Bumping version to: {new_version}")

    # Replace version strings in the content
    # 1. Update @version
    content, count_version = re.subn(
        rf"(@version\s+){re.escape(current_version)}",
        rf"\g<1>{new_version}",
        content
    )

    # 2. Update const VERSION
    content, count_const = re.subn(
        rf"(const\s+VERSION\s*=\s*['\"]){re.escape(current_version)}(['\"])",
        rf"\g<1>{new_version}\g<2>",
        content
    )

    # 3. Update @name version comment
    content, count_name = re.subn(
        rf"(\(\s*v){re.escape(current_version)}(,?\s*szerver nélkül\s*\))",
        rf"\g<1>{new_version}\g<2>",
        content
    )

    if count_version == 0 and count_const == 0 and count_name == 0:
        print("Warning: No replacements made. Is the version string correct?", file=sys.stderr)
        sys.exit(1)

    file_path.write_text(content, encoding="utf-8")
    print(f"Successfully bumped version in {file_path}")
    print(f"Replacements made: @version ({count_version}), const VERSION ({count_const}), @name ({count_name})")

if __name__ == "__main__":
    main()
