---
name: sync-references-from-icloud
description: "Synchronizes reference documents recursively from iCloud Drive '/UserScripts/references' into the local 'references' directory. Use this skill when asked to download, sync, pull, or fetch reference documents/webarchives from iCloud."
user-invocable: true
argument-hint: ""
---

# iCloud Reference Documents Synchronizer

This skill automates pulling down and recursively sync-updating webarchives or other documents located in iCloud's `/UserScripts/references` folder directly into your local `references/` directory.

It supports delta downloads based on modification times and sizes, saving status into `references/state.json`.

## Quick Execution Command

Execute this command in the terminal to trigger the incremental pull:

```powershell
py .\scripts\sync_references.py
```

## Step-by-Step Procedure
1. Confirm local workspace contains the synchronization script.
2. Execute: `py .\scripts\sync_references.py`
3. It uses the exact same Windows Credential Manager keyring credentials configured in the upload tool to prevent nagging for credentials.
4. Let it scan, download only new/changed files, and write the state database to `references/state.json`.
