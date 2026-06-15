// ==UserScript==
// @name         Security Journey → Hello World (v0.0.1)
// @namespace    https://my.securityjourney.com/
// @version      0.0.1
// @description  Hello World userscript a Security Journey (my.securityjourney.com) oldalhoz. Egyelőre csak egy overlay-t tesz az oldal tetejére, hogy igazoljuk, a script betöltődik és lefut. iOS Safari / Userscripts plugin-kompatibilis.
// @author       Szombathelyi Béla
// @match        https://my.securityjourney.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // Konstansok
    // ────────────────────────────────────────────────────────────────────────

    const VERSION    = '0.0.1';
    const OVERLAY_ID = 'sj-v0-overlay';
    const STYLE_ID   = 'sj-v0-style';
    const CLOSE_ID   = 'sj-v0-close';

    function log(...args) { console.log('[SJ V0]', ...args); }

    // ────────────────────────────────────────────────────────────────────────
    // Overlay
    // ────────────────────────────────────────────────────────────────────────

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${OVERLAY_ID} {
                position: fixed;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2147483647;
                background: #0b7285;
                color: #fff;
                font: 600 14px/1.4 -apple-system, system-ui, sans-serif;
                padding: 10px 16px;
                border-radius: 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,.25);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            #${CLOSE_ID} {
                cursor: pointer;
                font-weight: 700;
                opacity: .8;
            }
            #${CLOSE_ID}:hover { opacity: 1; }
        `;
        document.head.appendChild(style);
    }

    function buildOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;
        injectStyle();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        const label = document.createElement('span');
        label.textContent = `Hello World – Security Journey (v${VERSION})`;

        const close = document.createElement('span');
        close.id = CLOSE_ID;
        close.textContent = '✕';
        close.title = 'Bezárás';
        close.addEventListener('click', () => overlay.remove());

        overlay.appendChild(label);
        overlay.appendChild(close);
        document.body.appendChild(overlay);

        log('Overlay kirajzolva.');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Indítás
    // ────────────────────────────────────────────────────────────────────────

    log(`Betöltve, verzió: ${VERSION}`);
    buildOverlay();
})();
