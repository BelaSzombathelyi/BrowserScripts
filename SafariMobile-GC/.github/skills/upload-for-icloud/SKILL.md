---
name: upload-for-icloud
description: "Uploads the local GC.user.js grease monkey script directly to iCloud Drive under /UserScripts. Use this skill when the user asks to upload, sync, or deploy the userscript to iCloud."
user-invocable: true
argument-hint: "[extra arguments]"
---

# iCloud Userscript Uploader

This skill automates uploading the local `GC.user.js` file to iCloud Drive under the `/UserScripts` directory. It uses a pre-configured wrapper script to minimize required inputs and token usage.

## Triggering the Skill
Use this skill whenever the user says words like "feltöltés", "upload", "sync", "deploy", "iCloud", or requests copying the script to their iCloud Drive.

## Quick Execution Command
To execute the upload directly, run this command in the terminal:

```powershell
py .\scripts\upload_default.py
```

## Step-by-Step Procedure
1. Execute the command: `py .\scripts\upload_default.py`
2. If it is the first time running, enter your Apple ID and password which will be securely saved into Windows Credential Manager.
3. If requested, enter the 2FA code sent to your Apple device.
