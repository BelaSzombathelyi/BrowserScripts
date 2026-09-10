# iCloud Drive feltöltés

Ez a script egy helyi fájlt tölt fel az iCloud Drive kiválasztott mappájába az
`icloudpy` könyvtáron keresztül. Az `icloudpy` nem hivatalos Apple API-kliens,
ezért az Apple általi session-lejáratkor ismét meg kell adni a 2FA-kódot.

## Első telepítés

A repó gyökerében vedd fel és töltsd le a submodule-t:

```powershell
git submodule add https://github.com/mandarons/icloudpy.git SafariMobile-GC/vendor/icloudpy
git submodule update --init --recursive
py -m pip install -r SafariMobile-GC/vendor/icloudpy/requirements.txt
```

## Használat

```powershell
$env:ICLOUD_APPLE_ID = 'te@apple-id.hu'
py SafariMobile-GC/scripts/upload_to_icloud.py 'C:\Users\te\Downloads\pelda.md' '/Documents/Garmin'
```

Ha az `ICLOUD_APPLE_ID` nincs beállítva, a script bekéri. A jelszót is biztonságos
interaktív promptban kéri; `ICLOUD_PASSWORD` csak nem interaktív automatizáláshoz
szükséges. A session cookie-k alapból a `~/.icloudpy-sessions` könyvtárba kerülnek,
nem a repóba. Más helyhez állítsd az `ICLOUD_SESSION_DIR` környezeti változót.
