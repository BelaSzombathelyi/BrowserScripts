# Copilot Instructions for SJ.user.js Project

## Project Overview
You are assisting with the **SJ.user.js** project - a UserScript for the Security Journey platform (https://my.securityjourney.com).

**Key Context:**
- Runs on https://my.securityjourney.com
- Currently a **Hello World**: only injects an overlay to verify the script loads and runs
- Runs as iOS Safari UserScript via the UserScripts app
- Real functionality will be built on top later

## Development Workflow
1. **Edit only**: `Security/SJ.user.js`
2. **After save**: Copy to `/Users/bszombathelyi_local/Library/Mobile Documents/com~apple~CloudDocs/UserScripts/SecurityJourney.user.js`
   - This syncs via iCloud to iOS
3. **Always increment**: Version number in header and script name after each change

## Key Guidelines
- **Language**: Hungarian (Magyar)
- **Reference**: See `Connect/GC.user.js` for a similar, working example to model after

## Communication
Respond in Hungarian. When discussing code changes, always remind about version increments and the iCloud sync requirement.

## Auto-Include Files
When starting a new conversation about this project, always reference and analyze:
- [@SJ.user.js](SJ.user.js) - The main script file

---
*Refer to README.md in this folder for complete documentation.*
