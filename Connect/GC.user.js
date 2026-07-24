// ==UserScript==
// @name         Garmin Connect → Markdown (v3.5.3, szerver nélkül)
// @namespace    https://connect.garmin.com/
// @version      3.5.3
// @description  Garmin Connect activity detail oldal tetejére tesz egy overlay-t: egy kattintással Markdown fájlt tölt le (helyi szerver, FIT letöltés és Garmin API NÉLKÜL – kizárólag az oldal HTML-jéből bányászva). Megnyitja az „Időközök" tabot, „Összes" szűrőre vált, az összes lenyitható kört (caret) kibontja, és minden oszlopot beletesz az MD-be. Emellett megnyitja a „Zónákban töltött idő" tabot és a pulzus-/teljesítmény-/tempó-tartomány táblázatokat is beleteszi az MD-be. iOS Safari / Userscripts plugin-kompatibilis letöltés.
// @author       Szombathelyi Béla
// @match        https://connect.garmin.com/app/activity/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // Konstansok
    // ────────────────────────────────────────────────────────────────────────

    const VERSION       = '3.5.3';
    const OVERLAY_ID    = 'gc-v3-overlay';
    const STATUS_ID     = 'gc-v3-status';
    const BTN_ID        = 'gc-v3-btn';
    const STYLE_ID      = 'gc-v3-style';
    const CLOSE_ID      = 'gc-v3-close';

    const SPLITS_WAIT_MS  = 12000;   // Időközök tábla betöltési időkorlát
    const EXPAND_MAX_PASS = 40;      // Kibontási kísérletek max száma (végtelen ciklus ellen)
    const EXPAND_PASS_MS  = 180;     // Várakozás két kibontási kör között (re-render)

    // Ha true, hiba / „nem található elem" esetén extra diagnosztikai infót
    // (időbélyeg, kontextus, akár rész-DOM HTML) gyűjtünk, és ezt a generált
    // MD fájl végéhez fűzzük egy „Debug napló" szekcióban, hogy könnyebb
    // legyen a hibák utólagos javítása.
    const DEBUG = true;

    function log(...args)  { console.log('[GC V3]', ...args); }
    function sleep(ms)     { return new Promise((r) => setTimeout(r, ms)); }

    // ────────────────────────────────────────────────────────────────────────
    // Debug napló (csak DEBUG=true esetén gyűjt)
    // ────────────────────────────────────────────────────────────────────────

    const debugEntries = [];

    /** Egy elem (rész-)HTML-je, levágva, hogy ne dagassza fel túlzottan az MD-t */
    function htmlSnippet(el, maxLen = 1500) {
        if (!el) return '';
        try {
            let html = el.outerHTML || '';
            if (html.length > maxLen) html = `${html.slice(0, maxLen)}\n…(levágva, teljes hossz: ${html.length} kar.)…`;
            return html;
        } catch {
            return '';
        }
    }

    /** Diagnosztikai bejegyzés hozzáadása (hiba / nem talált elem esetén) */
    function dlog(label, detail, el) {
        if (!DEBUG) return;
        const entry = { time: new Date().toISOString(), label, detail: detail || '', html: el ? htmlSnippet(el) : '' };
        debugEntries.push(entry);
        log('[DEBUG]', label, detail || '', el || '');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Markdown segédfüggvények
    // ────────────────────────────────────────────────────────────────────────

    /** Markdown cellában a `|` és sortörés escape-elése */
    function escMd(s) {
        return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
    }

    /** Markdown táblázat sor */
    function mdRow(cells) {
        return `| ${cells.map(escMd).join(' | ')} |`;
    }

    /** Markdown táblázat (fejléc + elválasztó + sorok) */
    function mdTable(headers, rows) {
        if (!headers.length && !rows.length) return '';
        const lines = [];
        lines.push(mdRow(headers));
        lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
        for (const row of rows) lines.push(mdRow(row));
        return lines.join('\n');
    }

    // ────────────────────────────────────────────────────────────────────────
    // URL / DOM segédfüggvények
    // ────────────────────────────────────────────────────────────────────────

    function getActivityId() {
        const m = window.location.href.match(/\/app\/activity\/(\d+)/);
        return m ? m[1] : null;
    }

    /** CSS-module prefix-szel keresés (a __hash rész deploy-onként változik) */
    function q(prefixedClass, root) {
        return (root || document).querySelector(`[class*="${prefixedClass}"]`);
    }
    function qAll(prefixedClass, root) {
        return Array.from((root || document).querySelectorAll(`[class*="${prefixedClass}"]`));
    }

    function textOf(el) {
        if (!el) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    /** A `textContent`-tel ellentétben a rejtett (pl. display:none-os) leszármazottak
     *  szövegét NEM tartalmazza – ez kell ahhoz, hogy egy éppen látható, de a
     *  „tartomány" szót csak egy rejtett belső dialógusban tartalmazó szekciót
     *  (pl. Kivitelezési pontszám) ne illesszünk össze tévesen a Zónák panellel. */
    function visibleTextOf(el) {
        if (!el) return '';
        const txt = el.innerText;
        return (txt != null ? txt : (el.textContent || '')).replace(/\s+/g, ' ').trim();
    }

    function directTextOf(el) {
        if (!el) return '';
        const txt = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent || '')
            .join(' ');
        return txt.replace(/\s+/g, ' ').trim();
    }

    function compactSectionTitle(raw) {
        let s = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!s) return '';
        if (/^Futás\/séta/i.test(s)) return 'Futás/séta';
        if (/^Futási dinamika/i.test(s)) return 'Futási dinamika';
        s = s.replace(/\s+(A|Az)\s.+$/i, '');
        return s.trim();
    }

    function compactLabel(raw) {
        let s = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!s) return '';
        s = s.replace(/\s+(A|Az)\s.+$/i, '');
        s = s.replace(/\s*:\s*$/, '');
        return s.trim();
    }

    function isNoisyHeaderLine(label, value) {
        const l = String(label || '').toLowerCase();
        const v = String(value || '').toLowerCase();
        if (!l || !v) return true;
        if (/sport profil|biztonság|segítségkérés|megváltoztatja a tevékenységtípust/.test(l)) return true;
        if (/megváltoztatja a tevékenységtípust|a rendszer balesetet érzékelt|mégse|tovább/.test(v)) return true;
        if (v.length > 120) return true;
        return false;
    }

    function formatCaloriesKcal(value) {
        const text = String(value || '').replace(/\s*kcal\b/i, '').replace(/,/g, '').trim();
        return text ? `${text} kcal` : '';
    }

    function isVisible(el) {
        if (!el) return false;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function waitForElement(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) { resolve(existing); return; }
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) { clearInterval(timer); resolve(el); return; }
                if (Date.now() - start > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error(`Timeout: ${selector}`));
                }
            }, 200);
        });
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatDateTimeForExport(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}_${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    }

    // Magyar hónap- és napnevek (kisbetűsen kulcsolva, ékezetekkel)
    const HU_MONTHS = {
        'január': 1, 'február': 2, 'március': 3, 'április': 4,
        'május': 5, 'június': 6, 'július': 7, 'augusztus': 8,
        'szeptember': 9, 'október': 10, 'november': 11, 'december': 12,
    };
    const HU_WEEKDAYS = {
        'vasárnap': 0, 'hétfő': 1, 'kedd': 2, 'szerda': 3,
        'csütörtök': 4, 'péntek': 5, 'szombat': 6,
    };

    function parseHungarianTime(raw) {
        const m = String(raw || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(de|du)?\b/i);
        if (!m) return null;
        let hours = Number(m[1]);
        const minutes = Number(m[2]);
        const seconds = Number(m[3] || 0);
        const period = (m[4] || '').toLowerCase();
        if (period === 'du' && hours < 12) hours += 12;
        if (period === 'de' && hours === 12) hours = 0;
        if (hours > 23 || minutes > 59 || seconds > 59) return null;
        return { hours, minutes, seconds };
    }

    function applyTime(date, time) {
        if (time) date.setHours(time.hours, time.minutes, time.seconds, 0);
        else date.setHours(0, 0, 0, 0);
        return date;
    }

    function normalizeActivityDateTime(raw) {
        const text = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!text) return '';

        // A pontos idő mindig az „@" után áll (pl. „… @ 5:00 DU").
        // Az „@" utáni részből parszoljuk, hogy az időzóna-offset
        // (pl. „(UTC+02:00)") 02:00 értékét NE keverjük össze a valós idővel.
        const atIdx = text.lastIndexOf('@');
        const timePart = atIdx >= 0 ? text.slice(atIdx + 1) : text;
        const time = parseHungarianTime(timePart);

        // 1) Abszolút dátum: „Június 14, 2026 @ 9:26 DE"
        const abs = text.match(/([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)\s+(\d{1,2}),?\s+(\d{4})/);
        if (abs && HU_MONTHS[abs[1].toLowerCase()]) {
            const month = HU_MONTHS[abs[1].toLowerCase()];
            const day = Number(abs[2]);
            const year = Number(abs[3]);
            const base = new Date(year, month - 1, day);
            return formatDateTimeForExport(applyTime(base, time));
        }

        // 2) Relatív nap: a nap megnevezése közvetlenül az „@" előtt áll.
        const beforeAt = atIdx >= 0 ? text.slice(0, atIdx) : text;
        const dayToken = (beforeAt.trim().split(/\s+/).pop() || '').toLowerCase();
        const base = new Date();
        if (dayToken === 'ma') {
            // ma – nincs eltolás
        } else if (dayToken === 'tegnap') {
            base.setDate(base.getDate() - 1);
        } else if (Object.prototype.hasOwnProperty.call(HU_WEEKDAYS, dayToken)) {
            // A hétköznapnév mindig a múlt heti előfordulásra utal
            // (ha ma lenne, „Ma" jelenne meg), ezért az eltolás 1–7 nap.
            let diff = (base.getDay() - HU_WEEKDAYS[dayToken] + 7) % 7;
            if (diff === 0) diff = 7;
            base.setDate(base.getDate() - diff);
        } else {
            return text; // ismeretlen formátum – változatlanul visszaadjuk
        }
        return formatDateTimeForExport(applyTime(base, time));
    }

    /** Bármely látható, épp aktív tabpanel (aria-hidden nélkül) megkeresése */
    function findVisibleTabPanel() {
        return Array.from(document.querySelectorAll('[role="tabpanel"]'))
            .find((p) => isVisible(p) && String(p.getAttribute('aria-hidden') || '').toLowerCase() !== 'true') || null;
    }

    /** A tab gomb aria-controls attribútuma alapján a hozzá tartozó panel (a mobil oldalon
     *  a panel-id React useId-vel generált, nem a rögzített "tab-splits"/"tab-time-in-zones"). */
    function getTabPaneFromButton(tabBtn) {
        const controlsId = tabBtn?.getAttribute('aria-controls');
        if (!controlsId) return null;
        return document.getElementById(controlsId);
    }

    /** Az elem legközelebbi, „panelnek" tekinthető őse – akkor kell, ha a tabpanel
     *  (role="tabpanel" / rögzített #tab-* id) egyáltalán nem található meg, de a
     *  ténylegesen renderelt tartalom (pl. IntervalsTable sor) igen.
     *  FONTOS: a `[class*="Tab"]` szelektor korábban téves találatot adott, mert az
     *  „IntervalsTable_tableRow"/„IntervalsTable_table" osztálynevek is tartalmazzák
     *  a „Tab" alsztringet (a „Table" szó része), így az Element.closest() – ami
     *  előbb saját magát is megvizsgálja – rögtön magát a sort (vagy a táblát)
     *  adta vissza „panel"-ként ahelyett, hogy feljebb keresett volna a valódi,
     *  a szűrőt és a táblát is magába foglaló konténerig. Ezért itt csak a
     *  ténylegesen tab-panelre utaló, specifikusabb osztályneveket keressük. */
    function closestPane(el) {
        if (!el) return null;
        return el.closest('[role="tabpanel"], [class*="TabPanel"], [class*="Panel"], [class*="pane" i], section, article')
            || el.closest('table')?.parentElement
            || el.parentElement
            || el;
    }

    /** Ha a levezetett „panel" túl szűk (pl. csak a táblát tartalmazza, a felette lévő
     *  szűrőt nem), lépegetünk felfelé a DOM-ban, amíg a `predicate` igazzá nem válik,
     *  vagy el nem érjük a lépéskorlátot – így a forceAllFilter/scrapeSplitsTable
     *  számára is elérhetővé válik a szűrő és a tábla közös őse. */
    function widenPaneUntil(pane, predicate, maxSteps = 5) {
        let node = pane;
        let steps = 0;
        while (node && !predicate(node) && steps < maxSteps) {
            const parent = node.parentElement;
            if (!parent || parent === document.body) break;
            node = parent;
            steps++;
        }
        return node || pane;
    }

    function dispatchClick(el) {
        if (!el) return;
        try {
            el.scrollIntoView?.({ block: 'center' });
            el.focus?.({ preventScroll: true });
            const rect = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;
            const pointerOpts = {
                bubbles: true, cancelable: true, view: window,
                clientX, clientY, button: 0, buttons: 1,
                pointerId: 1, pointerType: 'mouse', isPrimary: true,
            };
            const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY, button: 0, buttons: 1 };
            const PointerCtor = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
            el.dispatchEvent(new PointerCtor('pointerdown', pointerOpts));
            el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
            el.dispatchEvent(new PointerCtor('pointerup', pointerOpts));
            el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
            el.dispatchEvent(new MouseEvent('click', mouseOpts));
            el.click?.();
        } catch (clickErr) {
            try { el.click(); } catch { /* nincs mit tenni */ }
        }
    }

    /** Billentyűzet-alapú aktiválás (Enter/Space) – az ARIA tab-widgetek jelentős
     *  része erre is hallgat, ha az egérkattintás szimulációja nem elég a
     *  React/keretrendszer belső eseménykezelőinek eléréséhez. */
    function dispatchActivateKeys(el) {
        if (!el) return;
        try {
            el.focus?.({ preventScroll: true });
            for (const key of ['Enter', ' ']) {
                const opts = { bubbles: true, cancelable: true, key, code: key === ' ' ? 'Space' : 'Enter' };
                el.dispatchEvent(new KeyboardEvent('keydown', opts));
                el.dispatchEvent(new KeyboardEvent('keyup', opts));
            }
        } catch { /* nincs mit tenni */ }
    }

    // ────────────────────────────────────────────────────────────────────────
    // DOM scraping – fejléc / összefoglaló
    // (Garmin API-t NEM hívunk – minden adat az oldal HTML-jéből jön)
    // ────────────────────────────────────────────────────────────────────────

    function scrapeActivityName() {
        const wrapper = q('InlineActivityNameEdit_activityNameWrapper');
        if (wrapper) {
            const label = wrapper.querySelector('[class*="InlineEdit_label"]');
            const name = label ? (label.getAttribute('title') || textOf(label)) : textOf(wrapper);
            if (name) return name.replace(/\s{2,}/g, ' ').trim();
        }
        const label = document.querySelector('span[class*="InlineEdit_label"]');
        if (label) return label.getAttribute('title') || textOf(label);
        dlog('scrapeActivityName: nincs találat', 'Sem az InlineActivityNameEdit_activityNameWrapper, sem az InlineEdit_label szelektor nem talált nevet.', document.querySelector('[class*="ActivityHeaderContainer_"]'));
        return '';
    }

    function scrapeActivityMeta() {
        const result = { type: '', dateTime: '', location: '' };

        // Sport profil: az iOS oldalon az ActivityMetaInfo_* nem létezik / junk-t produkál
        // Próbálunk más szelektort vagy kiürítjük (fallback: API nélkül ezt nem kapjuk meg)
        // (előfeltétele lenne az ActivityType ikon vagy icon szöveg, de nincs megbízható)

        const timeEl = q('ActivityMetaInfo_activityTime');
        if (timeEl) {
            const raw = textOf(timeEl);
            const m = raw.match(/Időpont:\s*(.+?)(?:\s+[A-Z]+[+\-]\d+:\d+|$)/);
            const rawDateTime = m ? m[1].trim() : raw.replace(/rögzítette:.*?Időpont:\s*/, '').trim();
            result.dateTime = normalizeActivityDateTime(rawDateTime);
        } else {
            dlog('scrapeActivityMeta: nincs ActivityMetaInfo_activityTime', '', document.querySelector('[class*="ActivityMetaInfo_"]'));
        }

        const locEl = q('ActivityMetaInfo_locationText');
        if (locEl) result.location = textOf(locEl);
        else dlog('scrapeActivityMeta: nincs ActivityMetaInfo_locationText', '', document.querySelector('[class*="ActivityMetaInfo_"]'));

        return result;
    }

    /** „Megjegyzések" – a Garmin saját jegyzet textarea-ja */
    function scrapeActivityNotes() {
        const noteEl = q('ActivityNotes_noteContainer');
        if (!noteEl) {
            dlog('scrapeActivityNotes: nincs ActivityNotes_noteContainer', '');
            return '';
        }
        const ta = noteEl.querySelector('textarea');
        if (ta && ta.value) return ta.value.trim();
        // A h3 fejlécet (pl. „Megjegyzések") ne vegyük bele
        const clone = noteEl.cloneNode(true);
        clone.querySelectorAll('h1,h2,h3,h4,h5,h6,button,svg').forEach((n) => n.remove());
        const note = textOf(clone);
        if (!note) return '';
        if (/^\d+\s*\/\s*\d+$/.test(note)) return '';
        return note;
    }

    /** Post-activity kommentek (ha vannak) */
    function scrapeComments() {
        const section = document.getElementById('activityCommentsViewPlaceholder')
                     || q('ActivityPageCommentSection_comments')
                     || q('ActivityPageCommentSection_container');
        if (!section) {
            dlog('scrapeComments: nincs komment szekció', '');
            return [];
        }
        const items = qAll('CommentItem_commentWrapper', section);
        const comments = [];
        for (const item of items) {
            const dateEl   = item.querySelector('[class*="CommentItem_commentDate"]');
            const bodyEl   = item.querySelector('[class*="CommentItem_commentBody"]');
            const authorEl = item.querySelector('[class*="CommentItem_commentAuthor"], [class*="CommentItem_author"], [class*="CommentItem_name"]');
            const date   = dateEl ? textOf(dateEl) : '';
            const body   = bodyEl ? textOf(bodyEl) : '';
            const author = authorEl ? textOf(authorEl) : '';
            if (body || date) comments.push({ date, author, body });
        }
        return comments;
    }

    /** StatsBlock szekciók összes label+value párja (DOM fallback) */
    function scrapeAllStatsBlocks() {
        const results = [];
        for (const container of qAll('StatsBlock_statsBlockContainer')) {
            const titleEl = container.querySelector('[class*="StatsBlock_statsBlockTitle"]');
            const rawTitle = titleEl ? (directTextOf(titleEl) || textOf(titleEl)) : '';
            const sectionTitle = compactSectionTitle(rawTitle);
            for (const fieldEl of container.querySelectorAll('[class*="DataBlock_dataField"]')) {
                const value = textOf(fieldEl);
                const parent = fieldEl.parentElement;
                const labelEl = parent?.querySelector('[class*="DataBlock_dataLabel"]');
                const rawLabel = labelEl ? (textOf(labelEl) || labelEl.getAttribute('title') || '') : '';
                const label = compactLabel(rawLabel);
                if (label && value) results.push({ section: sectionTitle, label, value });
            }
        }
        return results;
    }

    /** Fejléc kis statisztikái (DOM fallback, ha az API nem elérhető) */
    function scrapeHeaderStats() {
        const results = [];
        for (const el of qAll('ActivitySmallStats_activityStat')) {
            const fieldEl = el.querySelector('[class*="DataBlock_dataField"]');
            const labelEl = el.querySelector('[class*="DataBlock_dataLabel"]');
            if (!fieldEl || !labelEl) continue;
            const value = textOf(fieldEl);
            const label = compactLabel(textOf(labelEl) || labelEl.getAttribute('title') || '');
            if (!isNoisyHeaderLine(label, value)) results.push({ label, value });
        }
        return results;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Időközök tab – megnyitás, „Összes" szűrő, ÖSSZES kör kibontása, scrape
    // ────────────────────────────────────────────────────────────────────────

    /** Az „Időközök" tab gombja. A rögzített `#tabSplitsId` gyakran egy inaktív,
     *  a ténylegesen megjelenített Tabs_ komponenstől független (legacy/rejtett)
     *  elemre mutat, ezért elsőként a látható role="tab" elemek szövege alapján
     *  keresünk, és csak ha az nem talál semmit, esünk vissza a régi id-re. */
    function findSplitsTabButton() {
        const candidates = Array.from(document.querySelectorAll('[role="tab"]'));
        const byText = candidates.find((el) => isVisible(el) && /időközök|splits/i.test(textOf(el)));
        if (byText) return byText;
        return document.querySelector('#tabSplitsId');
    }

    /** Az „Időközök" tab gombjának megnyomása és a tartalom betöltésére várás */
    async function openSplitsTab(setStatus) {
        const tabBtn = findSplitsTabButton();
        if (!tabBtn) {
            setStatus('ℹ️ „Időközök" tab nem elérhető ezen az aktivitáson');
            dlog('openSplitsTab: nincs tab gomb', '', document.querySelector('[role="tablist"]'));
            return null;
        }
        setStatus('⏳ „Időközök" tab megnyitása…');
        dispatchClick(tabBtn);

        // A panel keresése: elsőként a tab gomb aria-controls attribútuma alapján,
        // majd a (gyakran elavult) "#tab-splits" id-vel, végül bármely látható
        // tabpanel alapján – és amíg a gomb nem lett aktív, tovább próbálkozunk
        // kattintással / billentyűzettel (Enter), mert egyes komponensek csak
        // ezekre reagálnak megbízhatóan.
        const start = Date.now();
        let pane = null;
        while (Date.now() - start < SPLITS_WAIT_MS) {
            pane = getTabPaneFromButton(tabBtn) || document.querySelector('#tab-splits') || findVisibleTabPanel();
            // Ha a fentiek egyike sem található (pl. a panelnek nincs aria-controls
            // párja és nincs role="tabpanel" sem), essünk vissza a ténylegesen
            // megjelent tartalom (kör-sorok) legközelebbi „panel" ősére.
            if (!pane) {
                const contentEl = document.querySelector(
                    '[class*="IntervalsTable_tableRow"], [class*="ListTable_tableRow"]',
                );
                if (contentEl) {
                    pane = closestPane(contentEl);
                    // A closestPane által talált ős még nem biztos, hogy tartalmazza a
                    // „Lépés típusa" szűrőt is (az gyakran a tábla fölötti testvér-elem) –
                    // lépegessünk feljebb, amíg a szűrő is a panel része nem lesz.
                    if (pane) {
                        pane = widenPaneUntil(
                            pane,
                            (node) => !!node.querySelector('[class*="ActivityIntervals_intervalsFilter"]'),
                        );
                    }
                }
            }
            const active = isTabActivated(tabBtn);
            const hasRows = pane && (
                pane.querySelector('[class*="IntervalsTable_tableRow"]')
                || pane.querySelector('[class*="ListTable_tableRow"]')
                || pane.querySelector('table tbody tr')
            );
            if (pane && isVisible(pane) && (active || hasRows)) break;
            if (!active) { dispatchClick(tabBtn); dispatchActivateKeys(tabBtn); }
            await sleep(200);
        }
        if (!pane || !isVisible(pane)) {
            setStatus('⚠️ Az „Időközök" panel nem jelent meg');
            dlog('openSplitsTab: panel nem jelent meg', '', tabBtn);
            return null;
        }
        // Várjuk meg, hogy legyen tartalom (IntervalsTable / ListTable sor vagy table)
        const rowStart = Date.now();
        while (Date.now() - rowStart < SPLITS_WAIT_MS) {
            if (pane.querySelector('[class*="IntervalsTable_tableRow"]')
             || pane.querySelector('[class*="ListTable_tableRow"]')
             || pane.querySelector('table tbody tr')) break;
            await sleep(200);
        }
        if (!pane.querySelector('[class*="IntervalsTable_tableRow"]')
         && !pane.querySelector('[class*="ListTable_tableRow"]')
         && !pane.querySelector('table tbody tr')) {
            dlog('openSplitsTab: időtúllépés, nincs sor a panelben', '', pane);
        }
        return pane;
    }

    /** „Lépés típusa" szűrő → „Összes" (ALL), hogy minden kör látszódjon */
    async function forceAllFilter(pane, setStatus) {
        const filter = pane.querySelector('[class*="ActivityIntervals_intervalsFilter"]');
        if (!filter) {
            dlog('forceAllFilter: nincs ActivityIntervals_intervalsFilter', '', pane);
            return;
        }
        const dropdownBtn = filter.querySelector('button[aria-haspopup="listbox"], [class*="Dropdown_dropdownButton"]');
        if (!dropdownBtn) {
            dlog('forceAllFilter: nincs dropdown gomb a szűrőben', '', filter);
            return;
        }

        // Ha már „Összes" van kiválasztva, ne nyúljunk hozzá
        const current = textOf(dropdownBtn).toLowerCase();
        if (current.includes('összes') || current.includes('all')) return;

        setStatus('⏳ Szűrő „Összes"-re állítása…');
        dispatchClick(dropdownBtn);
        await sleep(250);
        const allOpt = document.querySelector('li[data-value="ALL"], [data-value="ALL"]');
        if (allOpt) {
            dispatchClick(allOpt);
            await sleep(300);
        } else {
            dlog('forceAllFilter: nincs "ALL" opció a legördülőben', '', dropdownBtn.parentElement || dropdownBtn);
            // Zárjuk vissza a dropdown-t, ha nem találtuk az opciót
            dispatchClick(dropdownBtn);
        }
    }

    /**
     * Az ÖSSZES lenyitható kör kibontása az IntervalsTable-ben.
     * A valódi <table> szerkezetben a SZÜLŐ (kibontható) sor első <td>-jében
     * van egy <svg> caret (háromszög); a GYEREK kör-sorok testvér <tr>-ek,
     * melyek első <td>-je ÜRES (nincs svg). Kibontva a gyerek-sorok bekerülnek
     * a DOM-ba a szülő után. A caret kattintása TOGGLE – ezért sor-számlálással
     * ellenőrizzük, és ha véletlenül összecsuktunk, visszanyitjuk.
     */
    async function expandAllRows(pane, setStatus) {
        const table = pane.querySelector('[class*="IntervalsTable_table"]') || pane.querySelector('table');
        if (!table) {
            setStatus('⚠️ Nincs tábla az Időközök panelben');
            dlog('expandAllRows: nincs tábla', '', pane);
            return 0;
        }
        const rowSel = '[class*="IntervalsTable_tableRow"]';

        const allRows = () => {
            const inBody = Array.from(table.querySelectorAll(`tbody ${rowSel}`));
            if (inBody.length) return inBody;
            const generic = Array.from(table.querySelectorAll(rowSel));
            if (generic.length) return generic;
            return Array.from(table.querySelectorAll('tbody tr'));
        };

        const firstCell = (row) => row.querySelector('td') || row.querySelector('[class*="tableRowItem"]');
        // A caret-jelölő ikon osztálynevei deploy-onként változhatnak (svg, chevron-, caret-,
        // expand- ikon, vagy aria-expanded attribútum) – minél többfélét próbálunk felismerni.
        const caretSel = 'svg, [aria-expanded], [class*="caret" i], [class*="Caret"], '
                       + '[class*="chevron" i], [class*="Chevron"], [class*="expand" i], [class*="Expand"]';
        const caretOf = (row) => {
            const c = firstCell(row);
            if (c) {
                const found = c.querySelector(caretSel);
                if (found) return found;
            }
            if (row.hasAttribute && row.hasAttribute('aria-expanded')) return row;
            return null;
        };
        const hasCaret = (row) => !!caretOf(row);
        const rowIsMarkedExpanded = (row) => {
            if (row.getAttribute && row.getAttribute('aria-expanded') === 'true') return true;
            const c = caretOf(row);
            return !!(c && c.getAttribute && c.getAttribute('aria-expanded') === 'true');
        };
        const isExpanded = (row) => {
            if (rowIsMarkedExpanded(row)) return true;
            const n = row.nextElementSibling;
            if (!n || !n.matches || !n.matches(rowSel)) return false;
            const c = firstCell(n);
            return !!(c && !c.querySelector(caretSel));
        };

        let total = 0;
        let lastPassCount = -1;
        for (let pass = 0; pass < EXPAND_MAX_PASS; pass++) {
            const all = allRows();
            const parentRows = all.filter((r) => hasCaret(r));
            const unexpandedParents = parentRows.filter((r) => !isExpanded(r) && !r.dataset.gcv2done);

            if (unexpandedParents.length === 0) {
                if (lastPassCount === all.length) break; // Stabil állapot
                lastPassCount = all.length;
            }

            if (unexpandedParents.length === 0) break;

            const target = unexpandedParents[0];
            const caret = caretOf(target);
            if (!caret) continue;

            const before = all.length;
            setStatus(`⏳ Körök kibontása… (${total}, pass ${pass + 1})`);

            // Kattintás az svg-re vagy a TD-re — próbáljuk mind a kettőt
            const clickTarget = caret.parentElement || caret;
            if (typeof clickTarget.click === 'function') {
                clickTarget.click(); // natív click ha elérhető
            } else {
                dispatchClick(clickTarget); // fallback: custom dispatch
            }
            await sleep(EXPAND_PASS_MS);

            const after = allRows().length;

            if (after > before) {
                // Sikeres kibontás
                total++;
                target.dataset.gcv2done = '1';
            } else if (after < before) {
                // Véletlenül összecsuktunk – nyissuk vissza
                dispatchClick(caret.parentElement || caret);
                await sleep(EXPAND_PASS_MS);
                total++;
                target.dataset.gcv2done = '1';
            } else {
                // A caret kattintása nem hozott változást – próbáljuk a teljes sort is
                // (néhány deploy-ban a click handler a <tr>-en van, nem a caret ikonon)
                dispatchClick(target);
                await sleep(EXPAND_PASS_MS);
                const afterRow = allRows().length;
                if (afterRow > before) {
                    total++;
                } else if (afterRow < before) {
                    dispatchClick(target);
                    await sleep(EXPAND_PASS_MS);
                    total++;
                }
                target.dataset.gcv2done = '1';
            }
        }

        const finalRows = allRows();
        const finalParents = finalRows.filter((r) => hasCaret(r));
        const stillClosed = finalParents.filter((r) => !isExpanded(r));
        if (stillClosed.length > 0) {
            setStatus(`⚠️ ${stillClosed.length} szülő-sor maradt lezárva (${total} lett kibontva)`);
            dlog(`expandAllRows: ${stillClosed.length} szülő-sor maradt lezárva`, `Kibontva: ${total}`, stillClosed[0]);
        } else {
            setStatus(`✅ Összes szülő-sor kibontva (${total})`);
        }

        return total;
    }

    /**
     * A betöltött + kibontott Időközök tábla scrape-elése.
     * Elsődlegesen a div-alapú ListTable struktúrát olvassuk, majd a klasszikus
     * <table> (IntervalsTable / SortableTable) változatot fallback-ként.
     * @returns {{headers: string[], rows: string[][]}|null}
     */
    function scrapeSplitsTable(pane) {
        // ── 1. IntervalsTable (valódi <table>, az iOS oldal tényleges szerkezete) ──
        const ivTable = pane.querySelector('[class*="IntervalsTable_table"]');
        if (ivTable) {
            const headers = Array.from(ivTable.querySelectorAll('thead th')).map((th) => textOf(th));
            const rows = [];
            for (const tr of ivTable.querySelectorAll('tbody tr, tfoot tr')) {
                const cells = Array.from(tr.querySelectorAll('td')).map((td) => textOf(td));
                if (cells.length && cells.some((c) => c !== '')) rows.push(cells);
            }
            if (rows.length > 0) return dropEmptyColumns(headers, rows);
        }

        // ── 2. div-alapú ListTable (desktop fallback) ───────────────────────
        const listTable = pane.querySelector('[class*="ListTable_table"]');
        if (listTable) {
            const headers = qAll('ListTable_headerItem', listTable)
                .filter(isVisible)
                .map((h) => textOf(h));

            const rowEls = qAll('ListTable_tableRow', listTable).filter((r) => {
                if (!isVisible(r)) return false;
                // A header-sor is lehet tableRow; azt kiszűrjük, ha csak headerItem-eket tartalmaz
                if (r.querySelector('[class*="ListTable_headerItem"]')) return false;
                return true;
            });

            const rows = [];
            for (const rowEl of rowEls) {
                const cellEls = qAll('ListTable_tableRowItem', rowEl).filter(isVisible);
                if (cellEls.length === 0) continue;
                const cells = cellEls.map((c) => textOf(c));
                if (cells.some((c) => c !== '')) rows.push(cells);
            }
            if (rows.length > 0) return dropEmptyColumns(headers, rows);
        }

        // ── 3. klasszikus <table> fallback ──────────────────────────────────
        const table = pane.querySelector('table');
        if (table) {
            const headers = [];
            for (const th of table.querySelectorAll('thead th')) headers.push(textOf(th));
            if (headers.length === 0) {
                for (const hi of table.querySelectorAll('[class*="headerItem"]')) headers.push(textOf(hi));
            }
            const rows = [];
            for (const tr of table.querySelectorAll('tbody tr, tfoot tr')) {
                const cls = String(tr.className || '');
                if (/_hidden__/.test(cls)) continue;
                if (!isVisible(tr)) continue;
                const cells = Array.from(tr.querySelectorAll('td')).map((td) => textOf(td));
                if (cells.some((c) => c !== '')) rows.push(cells);
            }
            if (rows.length > 0) return dropEmptyColumns(headers, rows);
        }

        dlog('scrapeSplitsTable: nem sikerült egyetlen táblázat-struktúrát sem felismerni', '', pane);
        return null;
    }

    /** Üres oszlopok (üres fejléc ÉS minden cella üres) eldobása */
    function dropEmptyColumns(headers, rows) {
        const colCount = Math.max(headers.length, ...rows.map((r) => r.length));
        const keep = [];
        for (let c = 0; c < colCount; c++) {
            const header = (headers[c] || '').trim();
            const anyVal = rows.some((r) => (r[c] || '').trim() !== '');
            if (header || anyVal) keep.push(c);
        }
        return {
            headers: keep.map((c) => headers[c] || ''),
            rows: rows.map((r) => keep.map((c) => r[c] || '')),
        };
    }

    /** Teljes Időközök folyamat: tab → szűrő → kibontás → scrape */
    async function collectSplits(setStatus) {
        const pane = await openSplitsTab(setStatus);
        if (!pane) return null;
        await forceAllFilter(pane, setStatus);
        // Várjunk a szűrő utáni re-renderre
        await sleep(300);
        const expanded = await expandAllRows(pane, setStatus);
        if (expanded > 0) await sleep(300);
        setStatus('⏳ Időközök tábla beolvasása…');
        return scrapeSplitsTable(pane);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Zónákban töltött idő tab – megnyitás + scrape
    // ────────────────────────────────────────────────────────────────────────

    /** A „Zónákban töltött idő" tab gombja. Ugyanaz a jelenség, mint a splits
     *  tabnál: a rögzített `#tabTimeInZonesId` gyakran egy inaktív, a tényleges
     *  Tabs_ komponenstől független elemre mutat, ezért a látható role="tab"
     *  szöveg alapú keresés élvez elsőbbséget. */
    function findZonesTabButton() {
        const candidates = Array.from(document.querySelectorAll(
            '[role="tab"], button, a, [aria-controls="tab-time-in-zones"], [href="#tab-time-in-zones"]',
        ));
        const byText = candidates.find((el) => isVisible(el) && /zónákban töltött idő|time in zones/i.test(textOf(el)));
        if (byText) return byText;
        return document.querySelector('#tabTimeInZonesId');
    }

    function findZonesPane() {
        return document.querySelector('#tab-time-in-zones')
            || document.querySelector('[id*="time-in-zones"]')
            // A valódi React-komponens konténere (pl. „Tabs_timeInZonesTabContent__h3mfr")
            // – ez fogja körbe az összes tartomány-diagramot (pulzus/teljesítmény/tempó) a
            // hozzájuk tartozó címsorral együtt, szemben az egyes TimeInZonesChart_barRoot
            // sorokkal, amik önmagukban cím nélküliek (lásd widenPaneUntil az openZonesTab-ban).
            || document.querySelector('[class*="timeInZonesTabContent" i]')
            || null;
    }

    /** Igaz, ha a class-lista tartalmaz „active"/„selected" szót – a CSS-modulos
     *  osztálynevek (pl. „Tabs_active__WMhjA") aláhúzással határolják a szót, ezért
     *  a \b (word-boundary) regex nem elég: az „_" is szóalkotó karakternek számít,
     *  így pl. „Tabs_active__WMhjA" nem illeszkedne \bactive\b-re. Ehelyett a
     *  class-tokeneket csak betűk mentén daraboljuk szét. */
    function hasActiveClassToken(classes) {
        return String(classes || '')
            .split(/\s+/)
            .some((token) => token
                .split(/[^a-zA-Z]+/)
                .some((word) => /^(active|selected)$/i.test(word)));
    }

    function isTabActivated(el) {
        if (!el) return false;
        const ariaSelected = String(el.getAttribute('aria-selected') || '').toLowerCase();
        const ariaCurrent = String(el.getAttribute('aria-current') || '').toLowerCase();
        if (ariaSelected === 'true' || ariaCurrent === 'true') return true;
        if (hasActiveClassToken(el.className)) return true;
        // A React Tabs komponens az aktív állapotot gyakran a <li> (role="tab" szülő)
        // elemen jelöli, nem magán a kattintható belső elemen – ezért a szülőt is nézzük.
        const parent = el.parentElement;
        return !!(parent && hasActiveClassToken(parent.className));
    }

    /** A „Zónákban töltött idő" tab gombjának megnyomása és a tartalom betöltésére várás */
    async function openZonesTab(setStatus) {
        const tabBtn = findZonesTabButton();
        if (!tabBtn) {
            setStatus('ℹ️ „Zónákban töltött idő" tab nem elérhető ezen az aktivitáson');
            dlog('openZonesTab: nincs zóna tab gomb', '', document.querySelector('[role="tablist"]'));
            return null;
        }
        setStatus('⏳ „Zónákban töltött idő" tab megnyitása…');
        dispatchClick(tabBtn);

        const start = Date.now();
        while (Date.now() - start < SPLITS_WAIT_MS) {
            // A panel id-je mobilon React useId-vel generált, ezért elsőként a tab gomb
            // aria-controls attribútuma alapján, majd a rögzített id-vel/látható tabpanel-lel keresünk.
            let pane = getTabPaneFromButton(tabBtn) || findZonesPane() || findVisibleTabPanel();
            if (!pane || !/tartomány|zone/i.test(visibleTextOf(pane))) {
                // Ha egyik fenti sem hozott „tartomány" szöveget tartalmazó panelt,
                // essünk vissza a ténylegesen megjelent tartalom legközelebbi ősére
                // (a legkisebb – legspecifikusabb – szöveges egyezés alapján).
                // FONTOS: `textContent` a rejtett (pl. display:none-os önértékelő
                // dialógus) leszármazottak szövegét is tartalmazza, ezért egy attól
                // teljesen független, épp látható szekció (pl. a Kivitelezési
                // pontszám doboz, ha a rejtett dialógusában szerepel a „tartomány"
                // szó) is hamisan illeszkedhetne. Az `innerText` ezzel szemben csak
                // a ténylegesen látható szöveget adja vissza.
                const matches = Array.from(document.querySelectorAll('div, section, article'))
                    .filter((el) => isVisible(el) && /tartomány/i.test(visibleTextOf(el)));
                matches.sort((a, b) => visibleTextOf(a).length - visibleTextOf(b).length);
                if (matches[0]) {
                    pane = closestPane(matches[0]);
                    // A legkisebb egyezés jellemzően egyetlen tartomány-sor (pl.
                    // TimeInZonesChart_barRoot) – ennek sem a `closest()` panel-őse,
                    // sem önmaga nem tartalmazza a szekció címét (pl. „Pulzus-
                    // tartományok"), amely nélkül a scrapeZones() nem tud szekciót
                    // képezni a sorokból. Lépegessünk feljebb, amíg a widenPaneUntil
                    // meg nem találja a (többes számú) „…tartományok" címsort tartalmazó
                    // közös ősét, vagy a React-komponens valódi konténerét.
                    pane = widenPaneUntil(
                        pane,
                        (node) => /tartományok/i.test(visibleTextOf(node))
                            || /timeInZonesTabContent/i.test(String(node.className || '')),
                        8,
                    );
                }
            }
            const active = isTabActivated(tabBtn);
            const content = pane ? visibleTextOf(pane) : '';
            if (pane && isVisible(pane) && /tartomány|zone/i.test(content)) return pane;
            if (!active) { dispatchClick(tabBtn); dispatchActivateKeys(tabBtn); }
            await sleep(200);
        }
        setStatus('⚠️ A „Zónákban töltött idő" panel nem jelent meg');
        dlog('openZonesTab: időtúllépés, panel nem jelent meg', '', tabBtn);
        return null;
    }

    /**
     * A „Zónákban töltött idő" panel scrape-elése. Az ikon-alapú/CSS-modules
     * osztálynevek deploy-onként változhatnak, ezért a renderelt (layout szerinti)
     * szöveget (innerText) soronként elemezzük – ez robusztusabb, mint fix
     * class-szelektorokra hagyatkozni.
     * Formátum soronként (Garmin Connect):
     *   „<Szekció neve>-tartományok"
     *   „Tartomány 5 > 156 üt/p • Maximális"
     *   „2:51” és „5%” – az idő és az arány gyakran KÜLÖN sorként jelenik meg
     *   (a TimeInZonesChart_progressBarContainer flex-elrendezésű, és az
     *   innerText a flex-item span-eket is önálló sorként adja vissza,
     *   annak ellenére, hogy vizuálisan egymás mellett, ugyanabban a
     *   flex-„sorban” látszanak) – ezért mindkét esetet (egy közös sor vagy
     *   két külön sor) kezelnünk kell.
     * @returns {{title: string, rows: string[][]}[]}
     */
    function scrapeZones(pane) {
        const raw = pane.innerText || pane.textContent || '';
        const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

        const sectionRe = /tartományok$/i;
        const zoneLineRe = /^Tartomány\s+(\d+)\s+(.+?)(?:\s+(\d{1,3}:\d{2}(?::\d{2})?)\s+(\d{1,3})\s*%)?$/i;
        const timePctRe = /^(\d{1,3}:\d{2}(?::\d{2})?)\s+(\d{1,3})\s*%$/;
        const timeOnlyRe = /^(\d{1,3}:\d{2}(?::\d{2})?)$/;
        const pctOnlyRe = /^(\d{1,3})\s*%$/;

        const sections = [];
        let current = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (sectionRe.test(line) && !/^Tartomány\s+\d/i.test(line)) {
                current = { title: line, rows: [] };
                sections.push(current);
                continue;
            }
            const m = line.match(zoneLineRe);
            if (m && current) {
                const desc = m[2].trim();
                let time = m[3] || '';
                let pct  = m[4] ? `${m[4]}%` : '';
                // Ha az idő/arány nem szerepelt a zóna-soron, nézzük meg a
                // következő 1-2 sort: lehet egy közös „idő arány%" sor, vagy
                // két külön sor (előbb az idő, majd az arány – lásd fenti
                // megjegyzés a flex-item sortörésekről).
                if (!time || !pct) {
                    let j = i + 1;
                    const next = lines[j] || '';
                    const tp = next.match(timePctRe);
                    if (tp) {
                        time = time || tp[1];
                        pct = pct || `${tp[2]}%`;
                        i = j;
                    } else {
                        const to = next.match(timeOnlyRe);
                        const po = next.match(pctOnlyRe);
                        if (to && !time) {
                            time = to[1];
                            i = j;
                            j += 1;
                            const after = lines[j] || '';
                            const po2 = after.match(pctOnlyRe);
                            if (po2 && !pct) { pct = `${po2[1]}%`; i = j; }
                        } else if (po && !pct) {
                            pct = `${po[1]}%`;
                            i = j;
                        }
                    }
                }
                current.rows.push([m[1], desc, time, pct]);
            }
        }

        return sections.filter((s) => s.rows.length > 0);
    }

    /** Teljes Zónákban töltött idő folyamat: tab → scrape */
    async function collectZones(setStatus) {
        const pane = await openZonesTab(setStatus);
        if (!pane) return null;
        setStatus('⏳ Zónákban töltött idő beolvasása…');
        const zones = scrapeZones(pane);
        if (!zones || zones.length === 0) dlog('scrapeZones: nem sikerült egyetlen zóna-szekciót sem felismerni', '', pane);
        return zones;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Markdown összeállítás
    // ────────────────────────────────────────────────────────────────────────

    /** A fejléc meta-sorai (csak DOM-ból; Garmin API nélkül) */
    function buildSummaryLines(activityId, domMeta, headerStats, stats) {
        const lines = [];
        if (activityId)        lines.push(`Aktivitás ID: ${activityId}`);
        // Sport profil: az iOS DOM-ból nem kinyerhető megbízhatóan (ActivityMetaInfo_* nem létezik / junk)
        if (domMeta.dateTime)  lines.push(`Időpont: ${domMeta.dateTime}`);
        if (domMeta.location)  lines.push(`Helyszín: ${domMeta.location}`);
        for (const { label, value } of headerStats) {
            if (/^időpont$|^helyszín$/i.test(label)) continue;
            if (isNoisyHeaderLine(label, value)) continue;
            if (/^Kalóriaszám$/i.test(label)) {
                const calories = formatCaloriesKcal(value);
                if (calories) lines.push(`${label}: ${calories}`);
                continue;
            }
            lines.push(`${label}: ${value}`);
        }
        const activeCalories = findStatValue(stats, /Táplálék- és folyadékbeviteli adatok/i, /^Aktív kalória$/i);
        if (activeCalories) lines.push(`Aktív kalória: ${formatCaloriesKcal(activeCalories)}`);
        return lines;
    }

    function parseDurationSeconds(raw) {
        const txt = String(raw || '').replace(/\s+/g, '').replace(',', '.');
        if (!txt) return NaN;
        const parts = txt.split(':');
        if (parts.length < 2 || parts.length > 3) return NaN;
        const secs = Number(parts.pop());
        const mins = Number(parts.pop());
        const hours = parts.length ? Number(parts.pop()) : 0;
        if (![hours, mins, secs].every(Number.isFinite)) return NaN;
        return (hours * 3600) + (mins * 60) + secs;
    }

    function formatDuration(rawSeconds) {
        const total = Math.max(0, Math.round(Number(rawSeconds) || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function parseDistanceKm(raw) {
        const txt = String(raw || '').replace(',', '.').trim();
        const m = txt.match(/(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : NaN;
    }

    function formatPace(secondsPerKm) {
        if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '';
        const total = Math.round(secondsPerKm);
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        return `${mins}:${String(secs).padStart(2, '0')}/km`;
    }

    function isRunningStepType(rawType) {
        const s = String(rawType || '').trim();
        if (!s) return false;
        if (/^Futás\b/i.test(s)) return true;
        if (/^Run\b/i.test(s)) return true;
        return false;
    }

    function buildRunIntervalSummaryLines(splits) {
        if (!splits?.headers?.length || !splits?.rows?.length) return [];
        const headers = splits.headers.map((h) => String(h || '').trim());
        const typeIdx = headers.findIndex((h) => /^Lépés típusa$/i.test(h));
        const timeIdx = headers.findIndex((h) => /^Idő$/i.test(h));
        const distIdx = headers.findIndex((h) => /^Távolság$/i.test(h));
        if (typeIdx < 0 || timeIdx < 0 || distIdx < 0) return [];

        let runSeconds = 0;
        let runDistanceKm = 0;
        for (const row of splits.rows) {
            const type = String(row[typeIdx] || '');
            if (!isRunningStepType(type)) continue;
            const secs = parseDurationSeconds(row[timeIdx]);
            const km = parseDistanceKm(row[distIdx]);
            if (Number.isFinite(secs) && secs > 0) runSeconds += secs;
            if (Number.isFinite(km) && km > 0) runDistanceKm += km;
        }
        if (runSeconds <= 0 && runDistanceKm <= 0) return [];

        const lines = [];
        if (runSeconds > 0) lines.push('Futás idő: ' + formatDuration(runSeconds));
        if (runDistanceKm > 0) lines.push(`Futás távolság: ${runDistanceKm.toFixed(2)} km`);
        if (runSeconds > 0 && runDistanceKm > 0) lines.push(`Futás Tempó: ${formatPace(runSeconds / runDistanceKm)}`);
        return lines;
    }

    /** A StatsBlock szekciók szakaszokra bontva (### cím + „label: value" sorok) */
    function buildStatsSections(stats, splits) {
        if (!stats || !stats.length) return '';
        const order = [];
        const map = new Map();
        for (const { section, label, value } of stats) {
            if (/^Távolság$/i.test(section || '') && /^Távolság$/i.test(label || '')) continue;
            if (/^Táplálék- és folyadékbeviteli adatok$/i.test(section || '')) continue;
            const key = section || 'Egyéb';
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            map.get(key).push(`${label}: ${value}`);
        }
        const runSummaryLines = buildRunIntervalSummaryLines(splits);
        if (runSummaryLines.length > 0) {
            const key = 'Edzésintervallumok';
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            const existing = map.get(key);
            for (const line of runSummaryLines) {
                const label = line.split(':')[0];
                if (!existing.some((l) => new RegExp(`^${label}:`, 'i').test(l))) existing.push(line);
            }
        }
        return order.map((key) => `### ${key}\n\n${map.get(key).join('\n')}`).join('\n\n');
    }

    /** Egy StatsBlock érték kikeresése (pl. fejléc-időtartamhoz) */
    function findStatValue(stats, sectionRe, labelRe) {
        const hit = (stats || []).find((s) => sectionRe.test(s.section || '') && labelRe.test(s.label || ''));
        return hit ? hit.value : '';
    }

    /**
     * A kibontott Időközök tábla kettébontása:
     *   - intervals: a becsukott (összefoglaló) nézet sorai → tartomány-sorok
     *     (pl. „3 - 8") + az olyan egyedi sorok, amelyeket nem fed le tartomány
     *     (pl. 1, 2, 9, 14, 15, bemelegítés, áttekintés).
     *   - laps: a tényleges egyedi körök → minden NEM tartomány-sor (a kibontáskor
     *     megjelenő gyerek-sorok + az amúgy sem lenyitható sorok).
     * A „Kör" oszlop alapján dől el, hogy egy sor tartomány-e (pl. „3 - 8").
     */
    function splitLapsTable(splits) {
        if (!splits || !splits.rows || !splits.rows.length) return null;
        const { headers, rows } = splits;
        let korIdx = headers.findIndex((h) => /^Kör$/i.test(String(h || '').trim()));
        if (korIdx < 0) korIdx = 2; // a „Kör" oszlop tipikus pozíciója

        const rangeRe  = /^(\d+)\s*[-–—]\s*(\d+)$/;
        const singleRe = /^(\d+)$/;

        const intervals = [];
        const laps = [];
        let activeRange = null;

        for (const row of rows) {
            const kor = String(row[korIdx] || '').trim();
            const range = kor.match(rangeRe);
            if (range) {
                // Tartomány-sor (összecsukott szülő) → csak az intervallumokba
                activeRange = [Number(range[1]), Number(range[2])];
                intervals.push(row);
                continue;
            }

            const single = kor.match(singleRe);
            const n = single ? Number(single[1]) : null;
            const isChild = activeRange && n != null && n >= activeRange[0] && n <= activeRange[1];

            if (isChild) {
                // Kibontáskor megjelenő gyerek-sor → csak a körökbe
                laps.push(row);
                if (n === activeRange[1]) activeRange = null;
            } else {
                // Önálló sor (nem fedi tartomány) → mindkét táblába
                activeRange = null;
                intervals.push(row);
                laps.push(row);
            }
        }

        return {
            intervals: { headers, rows: intervals },
            laps:      { headers, rows: laps },
        };
    }

    function buildMarkdown({ activityId, splits, zones, stats, domName, domMeta, domNotes, domComments, headerStats }) {
        const sections = [];

        // ── Fejléc ──────────────────────────────────────────────────────────
        const dateStr = domMeta.dateTime || '';
        const durStr  = findStatValue(stats, /Időzítés|Time/i, /^Idő$|^Time$|Időtartam/i)
                     || findStatValue(stats, /./, /^Idő$|Időtartam/i);
        const nameStr = domName || '';
        const headerParts = [dateStr, durStr, nameStr].filter(Boolean);
        sections.push(`# Edzés: ${headerParts.join(' | ') || '–'}`);

        // ── Meta összefoglaló (ID, sport, időpont, helyszín, fejléc-statok) ──
        const summaryLines = buildSummaryLines(activityId, domMeta, headerStats, stats);
        if (summaryLines.length) sections.push(summaryLines.join('\n'));

        // ── Megjegyzések (Garmin saját jegyzet) ─────────────────────────────
        if (domNotes?.trim()) sections.push(`### Megjegyzések\n\n${domNotes}`);

        // ── Kommentek ───────────────────────────────────────────────────────
        if (domComments && domComments.length > 0) {
            const parts = ['### Kommentek'];
            for (const c of domComments) {
                const head = [c.date, c.author].filter(Boolean).join(' — ');
                if (head) parts.push(`\n**${head}**`);
                if (c.body) parts.push(`\n${c.body}`);
            }
            sections.push(parts.join('\n'));
        }

        // ── Körök / Időközök (a kibontott DOM tábla minden oszlopa) ──────────
        if (splits && splits.rows.length > 0) {
            const split = splitLapsTable(splits);
            if (split) {
                if (split.intervals.rows.length > 0) {
                    sections.push(`## Edzésintervallumok\n\n${mdTable(split.intervals.headers, split.intervals.rows)}`);
                }
                if (split.laps.rows.length > 0) {
                    const lapsNote = 'Nem feltétlenül egyenletes km-ek: terepfutásnál a felhasználó nagyon gyakran a tempóváltásoknál is új kört indít.';
                    sections.push(`## Körök\n\n${lapsNote}\n\n${mdTable(split.laps.headers, split.laps.rows)}`);
                }
            } else {
                sections.push(`## Körök\n\n${mdTable(splits.headers, splits.rows)}`);
            }
        }

        // ── Zónákban töltött idő (Pulzusszám-/Teljesítmény-/Tempó-tartományok) ──
        if (zones && zones.length > 0) {
            const zoneParts = zones.map(
                (z) => `### ${z.title}\n\n${mdTable(['Tartomány', 'Leírás', 'Idő', 'Arány'], z.rows)}`
            );
            sections.push(`## Zónákban töltött idő\n\n${zoneParts.join('\n\n')}`);
        }

        // ── Részletes statisztikák (StatsBlock szekciók) ────────────────────
        const statsMd = buildStatsSections(stats, splits);
        if (statsMd) sections.push(`## Statisztikák\n\n${statsMd}`);

        // ── Debug napló (csak DEBUG=true esetén, ha volt hiba / nem talált elem) ──
        if (DEBUG && debugEntries.length > 0) {
            const debugParts = [
                '## Debug napló',
                '_Ez a szekció csak akkor jelenik meg, ha a script tetején a `DEBUG` kapcsoló `true`. '
                + 'Hibakereséshez tartalmazza az összes olyan esetet, amikor egy várt DOM elem nem volt megtalálható, '
                + 'vagy hiba történt – időbélyeggel és, ha elérhető, a releváns (rész-)DOM HTML-jével.'
                + ' A script javításához nyugodtan mellékeld ezt a szekciót._',
            ];
            for (const entry of debugEntries) {
                debugParts.push(`### ${entry.time} — ${entry.label}`);
                if (entry.detail) debugParts.push(entry.detail);
                if (entry.html) debugParts.push(`\`\`\`html\n${entry.html}\n\`\`\``);
            }
            sections.push(debugParts.join('\n\n'));
        }

        // ── Verzió-lábléc: mindig az MD fájl legvégén, hogy látszódjon, melyik
        // script-verzióval készült az export ──────────────────────────────
        sections.push(`---\n_Generálva: GC→MD v${VERSION}_`);

        return sections.join('\n\n') + '\n';
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
                background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
                color: #fff; display: flex; align-items: center; gap: 10px;
                padding: 8px 12px; box-sizing: border-box; flex-wrap: wrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
                font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
            }
            #${OVERLAY_ID} .gc-badge {
                font-weight: 700; font-size: 12px; background: #334155;
                border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0;
            }
            #${BTN_ID} {
                border: none; border-radius: 8px; background: #0ea5e9; color: #fff;
                padding: 7px 14px; cursor: pointer; font-weight: 700; font-size: 13px;
                white-space: nowrap; flex-shrink: 0; transition: background 0.15s;
                -webkit-tap-highlight-color: transparent;
            }
            #${BTN_ID}:active { background: #0284c7; }
            #${BTN_ID}:disabled { background: #475569; cursor: default; opacity: 0.7; }
            #${STATUS_ID} {
                flex: 1; min-width: 120px; font-size: 12px; color: #cbd5e1;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #${CLOSE_ID} {
                border: none; background: transparent; color: #94a3b8; font-size: 18px;
                cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    function setStatus(msg, isError = false) {
        const el = document.getElementById(STATUS_ID);
        if (el) {
            el.textContent = msg;
            el.style.color = isError ? '#f87171' : '#cbd5e1';
        }
        log(msg);
    }

    function ensureOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;
        injectStyle();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        const badge = document.createElement('span');
        badge.className = 'gc-badge';
        badge.textContent = `GC→MD v${VERSION}`;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.textContent = '📥 Markdown letöltése';

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

        btn.addEventListener('click', () => {
            if (!btn.disabled) runExport(btn, status);
        });

        overlay.append(badge, btn, status, closeBtn);
        document.body.appendChild(overlay);
        document.body.style.paddingTop = '44px';
    }

    // ────────────────────────────────────────────────────────────────────────
    // Fő export folyamat
    // ────────────────────────────────────────────────────────────────────────

    async function runExport(btn, statusEl) {
        const activityId = getActivityId();
        if (!activityId) {
            setStatus('⚠️ Nem található activity ID az URL-ben', true);
            return;
        }
        btn.disabled = true;
        try {
            // 1. DOM scraping – fejléc / jegyzet / kommentek / statok (NINCS Garmin API)
            setStatus('⏳ Oldal beolvasása…');
            const domName     = scrapeActivityName();
            const domMeta     = scrapeActivityMeta();
            const domNotes    = scrapeActivityNotes();
            const domComments = scrapeComments();
            const headerStats = scrapeHeaderStats();
            const stats       = scrapeAllStatsBlocks();

            // 2. Időközök tab → „Összes" → összes kör kibontása → scrape
            const splits = await collectSplits(setStatus);

            // 2b. Zónákban töltött idő tab → scrape
            const zones = await collectZones(setStatus);

            // 3. Markdown
            setStatus('⏳ Markdown generálása…');
            const md = buildMarkdown({
                activityId, splits, zones, stats,
                domName, domMeta, domNotes, domComments, headerStats,
            });

            // 4. Letöltés
            const exportRe = /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}$/;
            const safeDateTime = exportRe.test(domMeta.dateTime)
                ? domMeta.dateTime.replace(/:/g, '-')
                : '';
            const filenamePrefix = safeDateTime ? `${safeDateTime}_` : '';
            const filename = `${filenamePrefix}${activityId}.md`;
            const ok = downloadOrOpenMd(filename, md);
            setStatus(ok ? `✅ Kész: ${filename}` : '⚠️ A letöltés nem indult el', !ok);
        } catch (err) {
            setStatus(`⚠️ Hiba: ${err?.message || err}`, true);
            log('Export hiba:', err);
            dlog('runExport: váratlan hiba', err?.stack || String(err?.message || err));
            // DEBUG esetén a hiba ellenére is próbáljunk letölteni egy debug-naplót,
            // hogy a hibakereséshez legyen mihez nyúlni.
            if (DEBUG && debugEntries.length > 0) {
                const debugMd = buildMarkdown({
                    activityId: getActivityId(), splits: null, zones: null, stats: [],
                    domName: '', domMeta: {}, domNotes: '', domComments: [], headerStats: [],
                });
                downloadOrOpenMd(`debug_${getActivityId() || 'hiba'}.md`, debugMd);
            }
        } finally {
            btn.disabled = false;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Inicializálás + SPA-navigáció figyelése
    // ────────────────────────────────────────────────────────────────────────

    function init() {
        if (!/\/app\/activity\/\d+/.test(location.pathname)) return;
        const MAX_WAIT = 30010;
        const POLL = 400;
        let elapsed = 0;
        const check = () => {
            const hasContent = q('ActivityHeaderContainer_')
                            || q('ActivitySmallStats_')
                            || q('InlineActivityNameEdit_')
                            || document.querySelector('[class*="DataBlock_dataField"]');
            if (hasContent || elapsed >= MAX_WAIT) {
                ensureOverlay();
                return;
            }
            elapsed += POLL;
            setTimeout(check, POLL);
        };
        setTimeout(check, POLL);
    }

    let lastPath = location.pathname;
    setInterval(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            document.getElementById(OVERLAY_ID)?.remove();
            document.body.style.paddingTop = '';
            init();
        }
    }, 500);

    init();

})();