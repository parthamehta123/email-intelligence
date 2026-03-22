---
name: email-task-extractor
description: "Polls Gmail via IMAP, processes ALL emails (no dedup), categorizes External/Internal, extracts summarized tasks, classifies email type via LLM, tracks threads, writes to CSV. Batches of 10, rate-limited to 100/day. Never sends or modifies anything."
metadata: {"openclaw":{"emoji":"📨","events":["cron","agent:bootstrap"],"requires":{"env":["GMAIL_ACCOUNT","GMAIL_APP_PASSWORD","ANTHROPIC_API_KEY"]}}}
---

# Email Task Extractor Hook

Connects to Gmail via IMAP, fetches ALL emails (no lookback limit, no dedup), sends each to Claude Haiku for analysis, and writes summarized tasks to `~/Documents/email-tasks.csv`.

Fires on cron schedule (every 10 minutes) and on agent bootstrap (throttled).

## What It Does

1. Connects to Gmail IMAP with an App Password
2. Fetches emails incrementally using UID tracking (10 per batch, 100/day max)
3. Every email gets processed — no content dedup, no skipping
4. Claude Haiku analyzes each email: categorizes, classifies type, extracts summarized tasks
5. External emails: always High priority, tasks only, no suggested actions
6. Internal emails: priority varies (default Medium), tasks + suggested action types
7. Threads detected via In-Reply-To/References headers and linked by ThreadId
8. Results written to CSV with proper AI-summarized tasks (not raw email text)

## Priority Rules

- **External**: Always High
- **Internal**: Default Medium, raised to High/Critical only for clear urgency

## Rate Limiting

- **Batch size**: 10 emails per cron run
- **Daily limit**: 100 emails per day (resets at midnight)
- **No lookback limit**: processes all emails including historical ones

## CSV Columns

Date, From, Company, Subject, Priority, Category, EmailType, Task, Due, SuggestedAction, Status, ThreadId

## Guardrails

- Read only. Never sends, replies, archives, or modifies anything.
- External emails: extract tasks only — never draft anything
- Internal emails: extract tasks + tag what deliverable type is needed
- AI summarizes tasks clearly — never dumps raw email text into CSV

## Setup

See SETUP.md in the project root.
