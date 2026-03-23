---
name: email-task-extractor
description: "Polls Gmail via IMAP, reads every email, uses Claude AI to extract context and tasks, writes clean 4-column CSV (From, Subject, Tasks, SuggestedAction). Batches of 10. Never sends or modifies anything."
metadata: {"openclaw":{"emoji":"📨","events":["cron","agent:bootstrap"],"requires":{"env":["GMAIL_ACCOUNT","GMAIL_APP_PASSWORD","ANTHROPIC_API_KEY"]}}}
---

# Email Task Extractor Hook

Connects to Gmail via IMAP, fetches every email, uses Claude Haiku to analyze and summarize, writes one row per email to `~/Documents/email-tasks.csv`.

Fires on cron schedule (every 10 minutes) and on agent bootstrap (throttled).

## What It Does

1. Connects to Gmail IMAP with an App Password
2. Fetches emails incrementally using UID tracking (10 per batch, no daily limit)
3. Claude Haiku reasons step-by-step about each email: who sent it, what they need, how urgent
4. External emails: LLM-driven priority (Critical → Low based on business impact), tasks only, no suggested actions
5. Internal emails: priority varies (default Medium), tasks + suggested deliverable type
6. One row per email with context summary + numbered action items
7. Results written to 4-column CSV: From, Subject, Tasks, SuggestedAction

## Priority (LLM-Driven)

- **Critical**: Client escalation, SLA breach, revenue at risk
- **High**: Direct client request, proposal needed, billing action required
- **Medium**: Vendor notification needing review, internal default
- **Low**: Newsletter, auto-reply, verification code, marketing

## CSV Columns

From, Subject, Tasks, SuggestedAction

## Guardrails

- Read only. Never sends, replies, archives, or modifies anything
- External emails: tasks only — SuggestedAction forcefully cleared in code
- Internal emails: tasks + deliverable type (email-draft, ppt, proposal, etc.)
- AI summarizes — never dumps raw email text

## Setup

See SETUP.md in the project root.
