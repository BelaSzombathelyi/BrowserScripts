// ==UserScript==
// @name         SJ DEV Loader (localhost:3001 hot-reload)
// @namespace    https://my.securityjourney.com/
// @version      1.0.1
// @description  Fejlesztői betöltő: a helyi SJ.user.js fájlt tölti be a `python3 -m http.server 3001` szerverről, és figyeli a változásokat. Mentés után magától újratölt – nincs copy-paste a Tampermonkey editorba. EZT telepítsd egyszer, a SJ.user.js-t NE.
// @author       Szombathelyi Béla
// @match        https://my.securityjourney.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // Beállítások
    // ────────────────────────────────────────────────────────────────────────

    // A helyi szerver címe. A Security mappában indítsd:
    //   python3 -m http.server 3001
    const SRC     = 'http://localhost:3001/SJ.user.js';
    const POLL_MS = 1500; // milyen gyakran nézze, változott-e a fájl
    const SCRIPT_ID = 'sj-dev-loaded-script';

    let lastCode = null;

    // GM_xmlhttpRequest kompatibilitás (Tampermonkey vs. Userscripts/GM4)
    const xhr =
        (typeof GM_xmlhttpRequest !== 'undefined' && GM_xmlhttpRequest) ||
        (typeof GM !== 'undefined' && GM.xmlHttpRequest) ||
        null;
    const addElement =
        (typeof GM_addElement !== 'undefined' && GM_addElement) ||
        (typeof GM !== 'undefined' && GM.addElement) ||
        null;

    function log(...a)  { console.log('[SJ DEV]', ...a); }
    function warn(...a) { console.warn('[SJ DEV]', ...a); }

    // ────────────────────────────────────────────────────────────────────────
    // Korábbi futás takarítása, hogy minden reload tiszta lappal induljon
    // ────────────────────────────────────────────────────────────────────────

    function cleanup() {
        document.getElementById(SCRIPT_ID)?.remove();
        // A fő script minden DOM eleme "sj-" prefixű id-t kap.
        document.querySelectorAll('[id^="sj-"]').forEach((el) => el.remove());
        // A fő script a body padding-top-ot állítja az overlay miatt – visszaállítjuk.
        document.body.style.paddingTop = '';
        // A fő script a navigáció-figyelő időzítőjét ide menti; töröljük.
        if (window.__sjNavTimer) {
            clearInterval(window.__sjNavTimer);
            window.__sjNavTimer = null;
        }
    }

    function inject() {
        cleanup();
        const src = SRC + '?t=' + Date.now();
        const attrs = { id: SCRIPT_ID, src };

        if (addElement) {
            const script = addElement(document.body || document.documentElement, 'script', attrs);
            script.addEventListener('load', () => log('Újratöltve ✅'));
            script.addEventListener('error', () => warn('Script betöltési hiba:', src));
            return;
        }

        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = src;
        script.addEventListener('load', () => log('Újratöltve ✅'));
        script.addEventListener('error', () => warn('Script betöltési hiba:', src));
        (document.body || document.documentElement).appendChild(script);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Lekérés + változásfigyelés
    // ────────────────────────────────────────────────────────────────────────

    function fetchCode() {
        if (!xhr) {
            warn('Nincs GM_xmlhttpRequest – a loader Tampermonkey/Userscripts plugint igényel.');
            return;
        }
        xhr({
            method:  'GET',
            url:     SRC + '?t=' + Date.now(), // cache-busting
            headers: { 'Cache-Control': 'no-cache' },
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    const code = res.responseText || '';
                    if (code && code !== lastCode) {
                        lastCode = code;
                        log('Változás észlelve – script újratöltése…');
                        inject();
                    }
                } else {
                    warn('HTTP', res.status, '– fut a szerver? `python3 -m http.server 3001` a Security mappában');
                }
            },
            onerror: () => {
                warn('Nem érhető el:', SRC, '– indítsd: `python3 -m http.server 3001` a Security mappában');
            },
        });
    }

    log('Loader aktív →', SRC, `(${POLL_MS} ms-enként figyel)`);
    fetchCode();
    setInterval(fetchCode, POLL_MS);
})();
