const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Paths
const PROJECT_DIR = path.resolve(__dirname, '..');
const REFERENCES_DIR = path.join(PROJECT_DIR, 'references');
const SNAPSHOTS_DIR = path.join(PROJECT_DIR, 'snapshots', 'references');
const USER_SCRIPT_PATH = path.join(PROJECT_DIR, 'GC.user.js');

// Create snapshots directory if it doesn't exist
if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Read the userscript code
const userScriptCode = fs.readFileSync(USER_SCRIPT_PATH, 'utf8');

// List of HTML reference files to test
const htmlFiles = fs.readdirSync(REFERENCES_DIR)
    .filter(file => file.endsWith('.html'));

if (htmlFiles.length === 0) {
    console.error('No .html files found in references/ directory. Please run extract_webarchives.py first!');
    process.exit(1);
}

// File name to mock activity ID mapping
const fileUrlMap = {
    'Garmin Connect.html': 'https://connect.garmin.com/app/activity/1152012019',
    'Terep hosszú .html': 'https://connect.garmin.com/app/activity/1152012020'
};

console.log(`Found ${htmlFiles.length} HTML reference files to run snapshots for.`);

async function runSnapshotOn(fileName) {
    const filePath = path.join(REFERENCES_DIR, fileName);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    
    // Create VirtualConsole to filter out noisy JSDOM/CSS errors
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("log", (...args) => console.log(...args));
    virtualConsole.on("info", (...args) => console.info(...args));
    virtualConsole.on("warn", (...args) => {
        const msg = args.join(' ');
        if (!msg.includes("Could not parse CSS") && !msg.includes("Error:")) {
            console.warn(...args);
        }
    });
    virtualConsole.on("error", (...args) => {
        const msg = args.join(' ');
        if (!msg.includes("Could not parse CSS") && !msg.includes("CSSStyleSheet")) {
            console.error(...args);
        }
    });

    const mockUrl = fileUrlMap[fileName] || 'https://connect.garmin.com/app/activity/12345678';

    // Create JSDOM instance
    const dom = new JSDOM(htmlContent, {
        url: mockUrl, // match expected URL path
        runScripts: 'outside-only', // safe execution
        virtualConsole,
    });

    const { window } = dom;
    const { document } = window;

    // --- MOCKS FOR BROWSER APIs IN JSDOM ---

    // 1. Mock visibility using offsetWidth / offsetHeight / getClientRects getters
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get() {
            let node = this;
            while (node) {
                if (node.style && (node.style.display === 'none' || node.style.visibility === 'hidden')) return 0;
                if (node.className && (typeof node.className === 'string') && (node.className.includes('hidden') || node.className.includes('_hidden__'))) return 0;
                node = node.parentElement;
            }
            return 100; // Simulated visible size
        }
    });

    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return this.offsetWidth; }
    });

    window.HTMLElement.prototype.getClientRects = function() {
        return this.offsetWidth > 0 ? [{ width: 100, height: 100 }] : [];
    };

    // 2. Mock URL, Blob & Anchor clicks for capturing the generated file
    const urlToBlobMap = new Map();
    window.URL.createObjectURL = (blob) => {
        const url = `blob:mocked-url-${Math.random()}`;
        urlToBlobMap.set(url, blob);
        return url;
    };
    window.URL.revokeObjectURL = () => {};

    const originalBlob = window.Blob;
    window.Blob = class MockBlob extends originalBlob {
        constructor(parts, options) {
            super(parts, options);
            this._textParts = parts; // Keep synchronous track of data parts
        }
    };

    let capturedFilename = null;
    let capturedMarkdown = null;

    window.HTMLAnchorElement.prototype.click = function() {
        if (this.download) {
            capturedFilename = this.download;
            const blob = urlToBlobMap.get(this.href);
            if (blob && blob._textParts) {
                capturedMarkdown = blob._textParts.join('');
            }
        }
    };

    // 3. Mock timers to execute super fast/instantly to speed up polling/sleep
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = (callback, delay) => {
        return originalSetTimeout(callback, 0); // instantly execute
    };

    const originalSetInterval = window.setInterval;
    window.setInterval = (callback, delay) => {
        return originalSetInterval(callback, 0); // instantly execute
    };

    // 4. Mock Date.now to automatically advance time to prevent 12-second busy spins inside the wait loops
    let virtualTime = Date.now();
    window.Date.now = () => {
        virtualTime += 100; // Each check advances time by 100ms
        return virtualTime;
    };

    // 5. Setup generic Tab switching behavior on document click
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.closest) {
            const tabBtn = target.closest('[role="tab"]');
            if (tabBtn) {
                tabBtn.setAttribute('aria-selected', 'true');
                if (tabBtn.parentElement) {
                    tabBtn.parentElement.setAttribute('aria-selected', 'true');
                }
                const list = tabBtn.closest('[role="tablist"]');
                if (list) {
                    for (const sibling of list.querySelectorAll('[role="tab"]')) {
                        if (sibling !== tabBtn) {
                            sibling.setAttribute('aria-selected', 'false');
                            if (sibling.parentElement) {
                                sibling.parentElement.setAttribute('aria-selected', 'false');
                            }
                        }
                    }
                }
                // Simulate showing the pane if it has aria-controls
                const controlsId = tabBtn.getAttribute('aria-controls');
                if (controlsId) {
                    const pane = document.getElementById(controlsId);
                    if (pane) {
                        pane.style.display = 'block';
                        pane.setAttribute('aria-hidden', 'false');
                    }
                }
            }
        }
    });

    // console.log mock so we see script progress
    window.console.log = (...args) => {
        console.log(`[JSDOM Log]`, ...args);
    };

    // --- RUNNING THE USERSCRIPT ---
    try {
        // Run the grease monkey script inside the JSDOM window context
        window.eval(userScriptCode);
        
        console.log(`Evaluating script on ${fileName}... waiting for overlay to initialize.`);
        
        // Wait a small tick for the setInterval check/POLL inside the user-script to initialize the overlay
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Find the download button in the document
        const downloadBtn = document.getElementById('gc-v3-btn');
        if (!downloadBtn) {
            console.error(`- Error: Download button not found in JSDOM on ${fileName}`);
            // Let's print out some elements to debug
            const header = document.querySelector('[class*="ActivityHeaderContainer_"]');
            console.log(`  Header element found: ${!!header}`);
            return;
        }

        console.log(`- Clicking 'Markdown letöltése' button...`);
        downloadBtn.click();

        // Poll until capturedMarkdown is generated or timeout (e.g. 5 seconds)
        const startWait = Date.now();
        while (!capturedMarkdown && (Date.now() - startWait < 5000)) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (capturedMarkdown && capturedFilename) {
            const outputPath = path.join(SNAPSHOTS_DIR, capturedFilename);
            fs.writeFileSync(outputPath, capturedMarkdown, 'utf8');
            console.log(`✅ Success! Snapshot saved to: ${path.relative(PROJECT_DIR, outputPath)}`);
        } else {
            console.error(`- Error: Content was not generated/captured for ${fileName}`);
        }

    } catch (e) {
        console.error(`Error running script on ${fileName}:`, e);
    }
}

async function runAll() {
    for (const file of htmlFiles) {
        await runSnapshotOn(file);
    }
    console.log('--- Snapshot runs finished ---');
}

runAll();
