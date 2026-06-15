# SJ.user.js
Ez a fájl egy Tampermonkey script lesz, amit tanuláshoz szeretnék használni.

# Feladata
Security Journey (https://my.securityjourney.com) oldalhoz készülő userscript. A különböző tesztkérdéseket le kellene mentenie MD fájlformátumban.
Lesznek kiválasztós kérdések, pl. 4 opcióval, radio gombbal.
De lesznek egészen komplex, pl. webes/egyéb forráskódok, ahol kódsorblokkok lesznek majd a kiválasztás alapjai. Ezeket jól kellene MD fájlba konvertálni, mert ezt akarom beadni az LLM-nek, pl. ChatGPT vagy Perplexity, hogy olvassa el, le tudjam játszani hangként, fordítsa le, és ha tippelek, tudjon segíteni a tanulásban érvelésekkel. Pont ezért a kimeneti fájl első pontja:

"Le kell fordítanod a kérdést és a válaszokat magyarra, semmiféle sallang vagy hozzátétel nélkül. NEM szabad olyat írnod, hogy 'itt a magyar fordítás', meg hasonlók, tényleg csak a kérdés és a válaszlehetőségek bulletpointokban."

# Fejlesztés menete (hot-reload, copy-paste nélkül)

A lényeg: a `SJ.user.js`-t **nem** telepíted a Tampermonkey-be. Helyette egyszer telepíted a `SJ.dev.user.js` **dev loadert**, ami egy helyi web-szerverről (`python3 -m http.server 3001`) tölti be és figyeli a `SJ.user.js`-t. Így minden mentés után magától újratölt – nincs copy-paste a Tampermonkey editorba.

## 1. Helyi szerver indítása
A `Security` mappában (ahol a `SJ.user.js` van):

```sh
cd Security
python3 -m http.server 3001
```

Ezt fejlesztés közben hagyd futni. (Ellenőrzés: böngészőben a `http://localhost:3001/SJ.user.js` megnyitása a kódot mutatja.)

## 2. Dev loader telepítése (egyszeri)
1. Nyisd meg a `SJ.dev.user.js` fájlt, és telepítsd a Tampermonkey-be (Chrome vagy desktop Safari).
2. Engedélyezd, amikor a Tampermonkey rákérdez a `localhost` elérésére (`@connect localhost`).
3. **Fontos:** a `SJ.user.js`-t ne telepítsd külön – azt a loader húzza be. (Ha korábban telepítve volt, kapcsold ki, hogy ne fusson kétszer.)

## 3. Fejlesztés
- Szerkeszd a `SJ.user.js`-t és mentsd.
- Frissítsd a Security Journey oldalt (**Cmd+R**), és a loader újra behúzza a friss kódot.
- A böngésző konzoljában a `[SJ DEV]` és `[SJ V0]` logokból látod, mi történik.

## Hogyan működik
- A `SJ.dev.user.js` a `SJ.user.js`-t **`@require http://localhost:3001/SJ.user.js`** direktívával húzza be. Ezt a userscript-kezelő injektálja (ugyanúgy, ahogy magát a loadert), **nem** a lap eval-ja vagy egy page `<script>` tag, ezért a Security Journey CSP-je **nem érvényes** rá.
- Miért nem fetch+eval vagy `<script src>`? Mert a lap CSP-je tiltja az `eval`/`new Function`-t (`unsafe-eval` hiba) és a `localhost` `<script src>`-et is (`script-src` blokk). A `@require` ezeket megkerüli.

## Safari + Tampermonkey beállítások (hot reload kulcsa)
A `@require` alapból **gyorsítótárazódik**, ezért a hot reloadhoz egy beállítás kell:

1. **External content cache kikapcsolása** – Tampermonkey ▸ Beállítások (Settings). Felül kapcsold a módot **Advanced**-re, majd keresd az **„External content cache"** opciót, és állítsd **0**-ra / **Disabled**-re. Ezután a `localhost` `@require` minden oldalfrissítéskor újra letöltődik → mentés után elég **Cmd+R**.
2. **Engedélyek** – Safari ▸ Beállítások ▸ Bővítmények ▸ Tampermonkey: a `my.securityjourney.com` legyen **Engedélyezve**.
3. **`localhost` elérés** – ha a Tampermonkey rákérdez a helyi szerver elérésére, engedélyezd.
4. **Loader frissítése** – mivel a header (`@require`, verzió) változott, a `SJ.dev.user.js`-t **telepítsd/töltsd újra** a Tampermonkey-ben, hogy az új `@require` érvénybe lépjen.

> Tipp: ha mégis `unsafe-eval` vagy `script-src` hibát látsz, akkor a régi (fetch+eval) loader fut még – győződj meg róla, hogy az `1.1.0`-s, `@require`-es változat van telepítve.

## Élesítés (ha kész a verzió)
Ha végeztél, a `SJ.user.js`-t telepítheted „rendesen" a Tampermonkey-be (drag&drop vagy git + `@downloadURL`), a dev loadert pedig kikapcsolhatod.

> Megjegyzés: a dev loader desktop Tampermonkey-vel működik (a `localhost` `@require`-hez a helyi szerver kell). iOS Safari / Userscripts pluginon a kész `SJ.user.js`-t használd.

# Referenciák
Ez egy egyszerű, 4 válaszopciós példa:
"Security/references/SJ-sima kiválaszós.webarchive"
