---
description: "Use when editing or updating the GC.user.js grease monkey script file to automatically bump version using the bump-version skill, trigger the iCloud upload skill, and send notifications."
applyTo: "GC.user.js"
---

# GC.user.js módosítási útmutató

Ez az útmutató automatikusan betöltődik, amikor a [GC.user.js](GC.user.js) fájlt módosítod vagy fejleszted.

használd a /references mappát az iCloudból szinkronizált dokumentumokhoz.
itt találsz activity-ket amiket elemezni kell.
Ez a script iOS Safari böngészőhöz kell, hogy fusson.


## Kötelező lépések minden módosítás után:

1. **Verzió emelése (Version Bump)**:
   - A [GC.user.js](GC.user.js) fájlban található verzió emeléséhez használd a **`bump-version`** skillt.
   - Ehhez futtasd le a következő parancsot a terminálban:
     ```powershell
     py .github/skills/bump-version/bump_version.py
     ```
   - Alapértelmezetten ez egy patch verzióemelést hajt végre (pl. `3.5.6` -> `3.5.7`). Szükség esetén használhatsz `--type minor` vagy `--type major` paramétert, illetve a `--set-version X.Y.Z` kapcsolóval konkrét verziót is megadhatsz.

2. **Automata iCloud feltöltés**:
   - Minden sikeres módosítás és verzióemelés után meg kell hívni az **`upload-for-icloud`** skillt az iCloud tárhelyre történő automatikus szinkronizációhoz.

3. **MS Teams értesítés küldése**:
   - A sikeres verzióemelés és feltöltés után meg kell hívni a **`teams-message`** skillt (vagy közvetlenül a `"C:\dev\teams_message_to_me.ps1"` scriptet) egy értesítő üzenettel, pl. *"GC.user.js sikeresen frissítve v1.X.X verzióra és feltöltve iCloudba!"*
