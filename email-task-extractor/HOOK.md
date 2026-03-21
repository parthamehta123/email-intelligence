---
name: email-task-extractor
description: "Polls Gmail via IMAP, reads all recent emails (not just unread), categorizes as External/Internal, extracts tasks with priority and suggested actions for internal items, writes to CSV. Deduplicates by Message-ID. Never sends or modifies anything."
metadata: {"openclaw":{"emoji":"📨","events":["cron","agent:bootstrap"],"requires":{"env":["GMAIL_ACCOUNT","GMAIL_APP_PASSWORD","ANTHROPIC_API_KEY"]}}}
---

# Email Task Extractor Hook

Connects to Gmail via IMAP, fetches all recent emails (read or unread), sends each to Claude Haiku for analysis, and writes tasks to `~/Documents/email-tasks.csv`.

Fires on cron schedule and on agent bootstrap (throttled to once per 5 minutes).

## What It Does

1. Connects to Gmail IMAP with an App Password
2. Fetches all emails from the last 3 days
3. Deduplicates against previously processed Message-IDs
4. Sends each new email to Claude Haiku for categorization + task extraction
5. External emails: tasks only, no suggested actions
6. Internal emails: tasks + suggested action type (draft, ppt, quote, etc.)
7. Writes results to CSV
8. Alerts immediately for Critical priority emails

## Guardrails

- Read only. Never sends, replies, archives, or modifies anything.
- External emails: extract tasks only — never draft anything
- Internal emails: extract tasks + tag what deliverable type is needed
- Junk emails (newsletters, notifications, OOO): skipped entirely

## Setup

See SETUP.md in the project root.
