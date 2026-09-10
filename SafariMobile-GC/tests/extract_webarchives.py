#!/usr/bin/env python3
import plistlib
from pathlib import Path

# Paths
TESTS_DIR = Path(__file__).resolve().parent
PROJECT_DIR = TESTS_DIR.parent
REFERENCES_DIR = PROJECT_DIR / "references"

def extract_webarchive(archive_path: Path, output_path: Path):
    print(f"Extracting {archive_path.name} to {output_path.name}...")
    try:
        with open(archive_path, 'rb') as f:
            pl = plistlib.load(f)
        
        main_resource = pl.get('WebMainResource')
        if not main_resource:
            print(f"Error: {archive_path.name} is missing 'WebMainResource'")
            return False
            
        data = main_resource.get('WebResourceData')
        if not data:
            print(f"Error: {archive_path.name} is missing 'WebResourceData'")
            return False
            
        encoding = main_resource.get('WebResourceTextEncodingName', 'utf-8')
        html_text = data.decode(encoding, errors='replace')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_text)
        print("Success!")
        return True
    except Exception as e:
        print(f"Error extracting {archive_path.name}: {e}")
        return False

def main():
    if not REFERENCES_DIR.exists():
        print(f"References directory does not exist at {REFERENCES_DIR}")
        return

    webarchives = list(REFERENCES_DIR.glob("*.webarchive"))
    if not webarchives:
        print("No .webarchive files found in references/")
        return

    extracted_count = 0
    for archive in webarchives:
        output_html = REFERENCES_DIR / f"{archive.stem}.html"
        if extract_webarchive(archive, output_html):
            extracted_count += 1
            
    print(f"Extracted {extracted_count} of {len(webarchives)} files.")

if __name__ == '__main__':
    main()
