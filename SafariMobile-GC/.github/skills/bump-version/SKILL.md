---
name: bump-version
description: "Increments the version number in GC.user.js using a Python script. Use this skill when asked to bump, increment, or change the version of the Userscript."
user-invocable: true
argument-hint: "[--type patch|minor|major] [--set-version X.Y.Z]"
---

# Version Bumper Skill

This skill automatically increments the version number in `GC.user.js` in three places:
1. `// @version X.Y.Z` in the metadata block
2. `const VERSION = 'X.Y.Z';` inside the script
3. `(vX.Y.Z, szerver nélkül)` inside the `@name` metadata tag

It is implemented as a Python script (`bump_version.py`) in the skill's own directory.

## Triggering the Skill
Use this skill whenever you modify `GC.user.js` and need to increment its version number before committing or uploading.

## Quick Execution Command
To execute the version bump (defaults to incrementing the patch number), run this command in terminal from the workspace root:

```powershell
py .github/skills/bump-version/bump_version.py
```

### Options
- To bump **minor** version (e.g. 3.5.6 -> 3.6.0):
  ```powershell
  py .github/skills/bump-version/bump_version.py --type minor
  ```
- To bump **major** version (e.g. 3.5.6 -> 4.0.0):
  ```powershell
  py .github/skills/bump-version/bump_version.py --type major
  ```
- To explicitly set a specific version:
  ```powershell
  py .github/skills/bump-version/bump_version.py --set-version 3.6.1
  ```
