// ==UserScript==
// @name         Security Journey → Markdown (v0.1.2)
// @namespace    https://my.securityjourney.com/
// @version      0.1.2
// @description  Security Journey (my.securityjourney.com) Knowledge Assessment kérdés kinyerése Markdown fájlba. Egy kattintással letölti az aktuális kérdést és a válaszlehetőségeket MD formátumban, amit be lehet adni egy LLM-nek (ChatGPT, Perplexity) fordításhoz/tanuláshoz. iOS Safari / Userscripts plugin-kompatibilis letöltés.
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

    const VERSION    = '0.1.2';
    const OVERLAY_ID = 'sj-v0-overlay';
    const STYLE_ID   = 'sj-v0-style';
    const BTN_ID     = 'sj-v0-btn';
    const STATUS_ID  = 'sj-v0-status';
    const CLOSE_ID   = 'sj-v0-close';

    // Az LLM-nek szóló utasítás, ami a kimeneti fájl legelső sora.
    const LLM_INSTRUCTION =
        'Le kell fordítanod a kérdést és a válaszokat magyarra, mindenféle sallang ' +
        'vagy hozzátétel nélkül. NEM szabad olyat írnod, hogy „itt a magyar fordítás" ' +
        'vagy hasonló - tényleg csak a kérdés és a válaszlehetőségek bulletpointokban.' +
        ' Ne mond meg a megfejtést, amíg nem kérik.';
    
    function log(...args) { console.log('[SJ V0]', ...args); }

    // ────────────────────────────────────────────────────────────────────────
    // DOM segédfüggvények
    // ────────────────────────────────────────────────────────────────────────

    /** CSS-module prefix-szel keresés (a __hash rész deploy-onként változik) */
    function q(prefixedClass, root) {
        return (root || document).querySelector(`[class*="${prefixedClass}"]`);
    }

    function textOf(el) {
        if (!el) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // ────────────────────────────────────────────────────────────────────────
    // Markdown segédfüggvények
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Egy elem tartalmát Markdownná alakítja. Egyszerű eset: csak szöveg.
     * Ha kód van benne (<pre>/<code>), akkor megőrzi fenced/inline kódként,
     * hogy a komplexebb (forráskódos) kérdések is jól nézzenek ki.
     */
    function htmlToMd(el) {
        if (!el) return '';

        // Ha nincs benne kód elem, elég a sima szöveg.
        if (!el.querySelector('pre, code')) {
            return textOf(el);
        }

        const parts = [];
        el.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                parts.push(node.textContent.replace(/\s+/g, ' '));
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();
            if (tag === 'pre') {
                const code = (node.textContent || '').replace(/\s+$/, '');
                parts.push(`\n\n\`\`\`\n${code}\n\`\`\`\n\n`);
            } else if (tag === 'code') {
                parts.push(`\`${textOf(node)}\``);
            } else if (tag === 'br') {
                parts.push('\n');
            } else {
                parts.push(htmlToMd(node));
            }
        });

        return parts.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    /** Fájlnévbe biztonságos slug egy szövegből */
    function slugify(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // ékezetek le
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'sj';
    }

    function pad2(n) { return String(n).padStart(2, '0'); }

    function timestamp() {
        const d = new Date();
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Kérdés kinyerése a DOM-ból
    // ────────────────────────────────────────────────────────────────────────

    function scrapeCategory() {
        // pl. "Secure Development & Design"
        const h1 = document.querySelector('h1.atlas-h4') || q('atlas-h4');
        return textOf(h1);
    }

    function scrapeTag() {
        // pl. "assessment"
        const tag = document.querySelector('[data-pc-section="value"]') || q('p-tag-value');
        return textOf(tag);
    }

    function scrapeProgress() {
        // pl. "Question 1 of 13"
        const pb = document.querySelector('[role="progressbar"][aria-valuetext]');
        if (pb) {
            const t = pb.getAttribute('aria-valuetext');
            if (t) return t.trim();
            const now = pb.getAttribute('aria-valuenow');
            const max = pb.getAttribute('aria-valuemax');
            if (now && max) return `Question ${now} of ${max}`;
        }
        return '';
    }

    function scrapePrompt() {
        const prompt =
            document.querySelector('[id^="mc-question-"][id$="-prompt"]') ||
            q('CommonQuestion-module__prompt');
        return htmlToMd(prompt);
    }

    function scrapeChoices() {
        // A radio-választások label-jei.
        const labels = Array.from(
            document.querySelectorAll('label[data-testid^="mc-label-"]')
        );
        let nodes = labels;
        if (!nodes.length) {
            // tartalék: a fieldset-en belüli label-ek
            const fieldset = q('CommonQuestion-module__radioChoices');
            if (fieldset) nodes = Array.from(fieldset.querySelectorAll('label'));
        }
        return nodes.map((el) => htmlToMd(el)).filter(Boolean);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Markdown összeállítása
    // ────────────────────────────────────────────────────────────────────────

    function buildMarkdown(data) {
        const { category, tag, progress, prompt, choices } = data;
        const lines = [];

        lines.push(LLM_INSTRUCTION);
        lines.push('');

        if (category) {
            lines.push('# Topic');
            lines.push(category);
            lines.push('');
        }

        lines.push('## Kérdés');
        lines.push('');
        lines.push(prompt || '*(nem található kérdésszöveg)*');
        lines.push('');

        lines.push('## Válaszlehetőségek');
        lines.push('');
        if (choices.length) {
            choices.forEach((c) => lines.push(`- ${c}`));
        } else {
            lines.push('*(nem található válaszlehetőség)*');
        }
        lines.push('');

        return lines.join('\n');
    }

    function buildFilename(data) {
        const m = String(data.progress || '').match(/(\d+)\s+of\s+(\d+)/i);
        const num = m ? `q${pad2(m[1])}-${m[2]}_` : '';
        const slug = slugify(data.category);
        return `SJ_${slug}_${num}${timestamp()}.md`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Letöltés (iOS Safari / Userscripts plugin-kompatibilis)
    // ────────────────────────────────────────────────────────────────────────

    function downloadOrOpenMd(filename, content) {
        try {
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = filename;
            a.rel      = 'noopener';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            return true;
        } catch (downloadErr) {
            log('Blob letöltés sikertelen, data URI fallback:', downloadErr);
            try {
                const dataUri = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
                window.open(dataUri, '_blank');
                return true;
            } catch (openErr) {
                log('data URI megnyitás is sikertelen:', openErr);
                return false;
            }
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Fő export folyamat
    // ────────────────────────────────────────────────────────────────────────

    function runExport(btn) {
        btn.disabled = true;
        try {
            setStatus('⏳ Kérdés beolvasása…');

            const data = {
                category: scrapeCategory(),
                tag:      scrapeTag(),
                progress: scrapeProgress(),
                prompt:   scrapePrompt(),
                choices:  scrapeChoices(),
            };

            if (!data.prompt && !data.choices.length) {
                setStatus('⚠️ Nem található kérdés ezen az oldalon', true);
                return;
            }

            const md = buildMarkdown(data);
            const filename = buildFilename(data);
            const ok = downloadOrOpenMd(filename, md);
            setStatus(ok ? `✅ Kész: ${filename}` : '⚠️ A letöltés nem indult el', !ok);
        } catch (err) {
            setStatus(`⚠️ Hiba: ${err?.message || err}`, true);
            log('Export hiba:', err);
        } finally {
            btn.disabled = false;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Overlay UI
    // ────────────────────────────────────────────────────────────────────────

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${OVERLAY_ID} {
                position: fixed; top: 0; left: 0; right: 0;
                z-index: 2147483647;
                background: linear-gradient(90deg, #0b7285 0%, #0c8599 100%);
                color: #fff; display: flex; align-items: center; gap: 10px;
                padding: 8px 12px; box-sizing: border-box; flex-wrap: wrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
                font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
            }
            #${OVERLAY_ID} .sj-badge {
                font-weight: 700; font-size: 12px; background: rgba(255,255,255,.18);
                border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0;
            }
            #${BTN_ID} {
                border: none; border-radius: 8px; background: #fff; color: #0b7285;
                padding: 7px 14px; cursor: pointer; font-weight: 700; font-size: 13px;
                white-space: nowrap; flex-shrink: 0; transition: opacity 0.15s;
                -webkit-tap-highlight-color: transparent;
            }
            #${BTN_ID}:active { opacity: .8; }
            #${BTN_ID}:disabled { opacity: 0.6; cursor: default; }
            #${STATUS_ID} {
                flex: 1; min-width: 120px; font-size: 12px; color: #e7f5f8;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #${CLOSE_ID} {
                border: none; background: transparent; color: #d0ebf2; font-size: 18px;
                cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    function setStatus(msg, isError = false) {
        const el = document.getElementById(STATUS_ID);
        if (el) {
            el.textContent = msg;
            el.style.color = isError ? '#ffc9c9' : '#e7f5f8';
        }
        log(msg);
    }

    function ensureOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;
        injectStyle();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        const badge = document.createElement('span');
        badge.className = 'sj-badge';
        badge.textContent = `SJ→MD v${VERSION}`;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.textContent = '📥 Kérdés letöltése (MD)';
        btn.addEventListener('click', () => {
            if (!btn.disabled) runExport(btn);
        });

        const status = document.createElement('span');
        status.id = STATUS_ID;
        status.textContent = 'Kész – kattints a letöltéshez';

        const closeBtn = document.createElement('button');
        closeBtn.id = CLOSE_ID;
        closeBtn.textContent = '✕';
        closeBtn.title = 'Overlay bezárása';
        closeBtn.addEventListener('click', () => {
            document.getElementById(OVERLAY_ID)?.remove();
            document.body.style.paddingTop = '';
        });

        overlay.append(badge, btn, status, closeBtn);
        document.body.appendChild(overlay);
        document.body.style.paddingTop = '44px';

        log('Overlay kirajzolva.');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Indítás + SPA-navigáció figyelése
    // ────────────────────────────────────────────────────────────────────────

    log(`Betöltve, verzió: ${VERSION}`);
    ensureOverlay();

    // Hot-reload-barát: ha a dev loader újrainjektál, az előző időzítőt töröljük,
    // hogy ne halmozódjanak a setInterval-ok. (A loader is erre az ablakváltozóra figyel.)
    if (window.__sjNavTimer) clearInterval(window.__sjNavTimer);
    let lastUrl = location.href;
    window.__sjNavTimer = setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            ensureOverlay();
        }
    }, 800);
})();
