---
name: teams-message
description: "Sends a MS Teams notification message to the developer. Use this skill when requested to notify, announce, post, or send messages about script statuses or code updates to Teams."
user-invocable: true
argument-hint: "<message_text>"
---

# MS Teams Notifier Skill

This skill automates sending messages to your MS Teams channel using a pre-configured PowerShell script located at `C:\dev\teams_message_to_me.ps1`.

## Quick Execution Command
To send a message directly from the command line:

```powershell
pwsh -File "C:\dev\teams_message_to_me.ps1" -Message "Your message text here"
# or if using Windows PowerShell:
powershell -File "C:\dev\teams_message_to_me.ps1" "Your message text here"
```

## Step-by-Step Procedure
1. Determine the message text to send.
2. Execute the PowerShell script passing the message as an argument.
3. Validate that the notification succeeds (check command exit code).
