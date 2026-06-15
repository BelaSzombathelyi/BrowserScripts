# Copilot Instructions for GC.user.js Project

## Project Overview
You are assisting with the **GC.user.js** project - a Garmin Connect data scraper that converts workout data to Markdown format for LLM analysis.

**Key Context:**
- Converts Garmin Connect data → Markdown format
- Used as attachments for ChatGPT and other LLMs
- Runs as iOS Safari UserScript via UserScripts app
- Development focus: clean, LLM-friendly formatting

## Development Workflow
1. **Edit only**: `Connect/GC.user.js`
2. **After save**: Copy to `/Users/bszombathelyi_local/Library/Mobile Documents/com~apple~CloudDocs/UserScripts/GarminConnectV2.user.js`
   - This syncs via iCloud to iOS
3. **Always increment**: Version number in header and script name after each change

## Key Guidelines
- **Language**: Hungarian (Magyar)
- **Format optimization**: Use abbreviated terms like "cadance_avg" for token optimization
- **References**: See `Connect/references/cél.md` for desired output format
- **Web archives**: Check `Connect/references/*.webarchive` for iOS examples
- **Output tracking**: New outputs go in `Connect/references/output/` with date stamps

## Communication
Respond in Hungarian. When discussing code changes, always remind about version increments and the iCloud sync requirement.

## Auto-Include Files
When starting a new conversation about this project, always reference and analyze:
- [@GC.user.js](GC.user.js) - The main script file

---
*Refer to README.md in this folder for complete documentation.*
