const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

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

console.log(`Found ${htmlFiles.length} HTML reference files to run snapshots for.`);

async function runSnapshotOn(fileName) {
    const filePath = path.join(REFERENCES_DIR, fileName);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    
    // Create JSDOM instance
    const dom = new JSDOM(htmlContent, {
        url: 'https://connect.garmin.com/app/activity/12345678', // match expected URL path
        runScripts: 'outside-only', // safe execution
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

        // Since setTimeout of JSDOM window is mocked to 0, runExport runs fully synchronous/near-instant
        // Let's wait a small bit for any remaining ticks/promises
        await new Promise(resolve => setTimeout(resolve, 100));

        if (capturedMarkdown) {
            const outBaseName = fileName.replace('.html', '.md');
            const outputPath = path.join(SNAPSHOTS_DIR, outBaseName);
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
