---
name: gmail-intel
description: Parse and prioritize Gmail emails for a senior account manager. Categorizes as External or Internal, extracts tasks with AI reasoning, suggests solutions for internal items. Never sends anything externally. Read-only intelligence layer.
metadata: {"openclaw":{"emoji":"📧","requires":{"env":["GMAIL_ACCOUNT"]},"primaryEnv":"GMAIL_ACCOUNT"}}
---

# Gmail Intelligence Skill

A read-only email intelligence layer. Parses Gmail, uses AI to reason about each email, extracts context and tasks, and for internal emails suggests what deliverable is needed. **Never sends or drafts anything for external clients.**

## Core Rules

```
EXTERNAL emails (clients, prospects, vendors):
  - READ and PARSE
  - AI reasons about priority based on business impact
  - Extract context + numbered tasks to CSV
  - NEVER draft, reply, or suggest responses

INTERNAL emails (colleagues, managers, leadership):
  - READ and PARSE
  - Extract context + numbered tasks to CSV
  - SUGGEST deliverable type: email-draft, ppt, quote, proposal, contract-draft, citation, report, spreadsheet
  - NEVER send or respond automatically

ALL emails:
  - NEVER modify the inbox (no deletes, archives, moves)
  - NEVER share email contents with third-party services
```

## Priority (LLM-Driven)

The AI reasons step-by-step about each email:

| Priority | External signals | Internal signals |
|----------|-----------------|-----------------|
| Critical | Client escalation, SLA breach, revenue risk | Executive demand, urgent deadline |
| High | Direct client request, proposal needed, billing action | Clear deadline, escalation |
| Medium | Vendor notification needing review | Default for most internal emails |
| Low | Newsletter, auto-reply, marketing, verification | Pure FYI, no action needed |

## CSV Output

Tasks are logged to `~/Documents/email-tasks.csv`:

```csv
From,Subject,Tasks,SuggestedAction
Sarah Chen,"Urgent — Q3 Renewal","Client needs revised proposal with 15% volume discount. 1. Prepare renewal proposal (Due: Friday) 2. Include Q1 analytics (Due: Friday)",""
Manager,"Prepare TechCorp deck","Internal request for status deck. 1. Build deck with pipeline numbers (Due: Tomorrow)","ppt"
AWS,"Earn additional credits","AWS marketing offering $40 credits. No action needed.",""
```

## Trigger Phrases

- `"check emails"` / `"email briefing"` — full briefing
- `"what's urgent"` — Critical + High only
- `"email tasks"` — all tasks extracted from emails
- `"parse emails from [person/company]"` — focus on sender
- `"any client emails I missed"` — external only
- `"internal action items"` — internal with suggested actions
