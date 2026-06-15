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
- Frissítsd a Security Journey oldalt (vagy várj a következő figyelési ciklusra – kb. 1,5 mp), és a loader újratölti a friss kódot.
- A böngésző konzoljában a `[SJ DEV]` és `[SJ V0]` logokból látod, mi történik.

## Hogyan működik
- A `SJ.dev.user.js` `GM_xmlhttpRequest`-tel figyeli, változott-e a fájl – ez megkerüli a CORS-t és a mixed-content blokkolást (ezért nem sima `fetch`).
- Változáskor a scriptet külső `<script src="http://localhost:3001/SJ.user.js?t=...">` betöltéssel injektálja, lehetőleg `GM_addElement`-tel. Ez azért fontos, mert a Security Journey CSP-je tiltja az `eval` / `new Function` alapú futtatást.
- Cache-busting query (`?t=...`) miatt mindig a friss verziót kapja.
- Újrainjektálás előtt kitakarítja az előző futás DOM elemeit (`[id^="sj-"]`), a dev loader által beszúrt script taget és a `window.__sjNavTimer` időzítőt, így nem halmozódnak az időzítők.

## Élesítés (ha kész a verzió)
Ha végeztél, a `SJ.user.js`-t telepítheted „rendesen” a Tampermonkey-be (drag&drop vagy git + `@downloadURL`), a dev loadert pedig kikapcsolhatod.

> Megjegyzés: a dev loader csak desktop Tampermonkey-vel működik (a `localhost` eléréshez `GM_xmlhttpRequest` kell). iOS Safari / Userscripts pluginon a kész `SJ.user.js`-t használd.

# Referenciák
Ez egy egyszerű, 4 válaszopciós példa:
"Security/references/SJ-sima kiválaszós.webarchive"
