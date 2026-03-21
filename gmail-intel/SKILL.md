---
name: gmail-intel
description: Parse and prioritize Gmail emails for a senior account manager. Categorizes as External or Internal, extracts tasks, suggests solutions for internal items. Never sends anything externally. Read-only intelligence layer.
metadata: {"openclaw":{"emoji":"📧","requires":{"env":["GMAIL_ACCOUNT"]},"primaryEnv":"GMAIL_ACCOUNT"}}
---

# Gmail Intelligence Skill

A read-only email intelligence layer. Parses Gmail, categorizes by External/Internal, extracts tasks, and for internal emails suggests what deliverable is needed. **Never sends or drafts anything for external clients.**

## Core Rules

```
EXTERNAL emails (clients, prospects, vendors):
  ✅ READ and PARSE
  ✅ EXTRACT tasks to CSV
  ✅ PRIORITIZE and summarize
  ❌ NEVER draft, reply, or suggest responses
  ❌ NEVER send anything — clients hate AI slop

INTERNAL emails (colleagues, managers, leadership):
  ✅ READ and PARSE
  ✅ EXTRACT tasks to CSV
  ✅ PRIORITIZE and summarize
  ✅ SUGGEST solutions: email drafts, PPTs, quotes, proposals, contracts, citations
  ❌ NEVER send or respond automatically

ALL emails:
  ❌ NEVER modify the inbox (no deletes, archives, moves)
  ❌ NEVER share email contents with third-party services
```

## Priority Scoring

| Signal | Score |
|--------|-------|
| From a client or named account contact | +2 |
| From manager or Clarivate leadership | +2 |
| Contains contract, renewal, proposal, quote | +2 |
| Action required / explicit ask | +2 |
| Contains deadline or date | +1 |
| Thread unanswered / follow-up language | +1 |
| Contains "urgent", "ASAP", "critical" | +1 |
| Mass CC / newsletter / automated | -3 |
| Internal FYI only, no action | -1 |

**Bands:** 🔴 Critical (5+) | 🟠 High (3-4) | 🟡 Medium (2) | 🟢 Low (0-1) | ⚫ Junk (skip)

## Task Extraction

Break every actionable item into separate tasks. Each task needs:
- **Title:** action verb + specific deliverable
- **Due:** deadline or "This week" or "ASAP"
- **Context:** one sentence of background

For **internal emails only**, also tag the suggested action type:
`email-draft` | `ppt` | `quote` | `proposal` | `contract-draft` | `citation` | `report` | `spreadsheet`

## CSV Output

Tasks are logged to `~/Documents/email-tasks.csv`:

```csv
Date,From,Company,Subject,Priority,Category,Task,Due,SuggestedAction,Status
2026-03-18,john@acme.com,acme.com,Q2 Renewal,High,External,Follow up on renewal terms,2026-03-20,,Pending
2026-03-18,manager@clarivate.com,clarivate.com,TechCorp Escalation,Critical,Internal,Prepare account status update,ASAP,email-draft,Pending
```

## Trigger Phrases

- `"check emails"` / `"email briefing"` — full briefing
- `"what's urgent"` — Critical + High only
- `"email tasks"` — all tasks extracted from emails
- `"parse emails from [person/company]"` — focus on sender
- `"any client emails I missed"` — external only
- `"internal action items"` — internal with suggested actions

## What to Ignore

- Marketing, newsletters, automated notifications
- Calendar invites with no discussion
- CC'd threads with no action needed
- Out of office replies
- Company-wide announcements with no personal action
