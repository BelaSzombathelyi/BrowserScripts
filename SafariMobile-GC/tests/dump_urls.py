import plistlib
from pathlib import Path

# Paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
REFERENCES_DIR = PROJECT_DIR / "references"

def dump_urls():
    for archive in REFERENCES_DIR.glob("*.webarchive"):
        with open(archive, 'rb') as f:
            pl = plistlib.load(f)
        main_resource = pl.get('WebMainResource')
        if main_resource:
            url = main_resource.get('WebResourceURL')
            print(f"{archive.name}: {url}")

if __name__ == '__main__':
    dump_urls()
