// ==UserScript==
// @name         SJ DEV Loader (localhost:3001 hot-reload)
// @namespace    https://my.securityjourney.com/
// @version      1.1.0
// @description  Fejlesztői betöltő: a helyi SJ.user.js fájlt @require-rel húzza be a `python3 -m http.server 3001` szerverről. CSP-álló (nem eval, nem page <script>). Hot reload: kapcsold ki a Tampermonkey "External content cache"-t, majd frissítsd az oldalt. EZT telepítsd egyszer, a SJ.user.js-t NE.
// @author       Szombathelyi Béla
// @match        https://my.securityjourney.com/*
// @grant        none
// @require      http://localhost:3001/SJ.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // Miért @require és nem fetch + eval / <script src>?
    // ────────────────────────────────────────────────────────────────────────
    //
    // A Security Journey CSP-je:
    //   - tiltja az eval/new Function-t      → `unsafe-eval` hiba,
    //   - tiltja a localhost <script src>-et → `script-src` blokk.
    //
    // A @require-elt kód viszont UGYANÚGY fut be, ahogy maga ez a loader fut
    // (ezt a [SJ DEV] log is bizonyítja) – a userscript-kezelő injektálja, NEM
    // a lap eval-ja, ezért a CSP nem érvényes rá. Ez a megbízható, CSP-álló út.
    //
    // HOT RELOAD beállítás (a "drag&drop / copy-paste" kiváltása):
    //   Tampermonkey ▸ Beállítások (Settings; kapcsold Advanced-re) ▸
    //   "External content cache" → állítsd 0-ra / Disabled.
    //   Ezután a localhost @require minden oldalfrissítéskor újra letöltődik:
    //   szerkeszd a SJ.user.js-t → mentsd → frissítsd az oldalt (Cmd+R).
    //
    // A `python3 -m http.server 3001` a Security mappában fusson.

    console.log('[SJ DEV] Loader v1.1.0 – SJ.user.js @require-rel betöltve (localhost:3001).');
    console.log('[SJ DEV] Hot reload: Tampermonkey "External content cache" = 0/Disabled, majd Cmd+R.');
})();
