# Email Intelligence

AI-powered email monitoring that reads your Gmail, understands every email through LLM reasoning, and outputs a clean spreadsheet of who emailed you, what they need, and what you should do — so you never have to dig through your inbox again.

**Read-only. Never sends, replies, or modifies anything.**

---

## The Problem

You get 100+ emails a day. Newsletters, client requests, vendor notifications, escalations, auto-replies — all mixed together. You spend the first hour of every morning just triaging. Half the emails don't need you. The ones that do get buried.

## The Solution

Email Intelligence connects to your Gmail via IMAP, reads every email, and uses Claude AI to produce a 4-column spreadsheet:

| From | Subject | Tasks | SuggestedAction |
|------|---------|-------|-----------------|
| Sarah Chen | Urgent — Q3 Enterprise Renewal | Client needs revised proposal with 15% volume discount and 99.9% SLA by Friday. 1. Prepare revised enterprise renewal proposal (Due: Friday) 2. Include Q1 usage analytics for board deck (Due: Friday) | |
| AWS | Action required — account past due | AWS billing notification — payment failed on card ending 1440. 1. Resolve past-due payment (Due: ASAP) | |
| Databricks Team | How to build ETL pipelines fast | Databricks marketing newsletter promoting O'Reilly guide on ETL pipelines. No action needed. | |
| Manager | Prepare TechCorp status deck | Internal request to prepare status update for TechCorp account review. 1. Build TechCorp status deck with pipeline numbers (Due: Tomorrow) 2. Draft response to TechCorp VP (Due: Tomorrow) | ppt, email-draft |

Open the spreadsheet. Scan it. Know exactly what every email is about and what to do. Never open the email.

---

## How It Works

```
Gmail (IMAP) → Every email fetched → Claude AI analyzes each one → Clean CSV/Excel output
```

1. Connects to Gmail via IMAP (app password, no OAuth complexity)
2. Fetches every email — no lookback limit, processes historical emails too
3. Claude Haiku reads each email and reasons step-by-step:
   - Who sent this? Client? Vendor? Newsletter? Auto-reply?
   - What's the business impact? Does the account manager need to act?
   - What specifically needs to be done? By when?
4. Writes one row per email to `~/Documents/email-tasks.csv`
5. Runs automatically every 10 minutes

## Smart Priority Reasoning

The AI doesn't just flag everything as important. It thinks about each email:

| What it sees | Priority | Tasks output |
|-------------|----------|-------------|
| Client escalation, SLA breach | **Critical** | Full context + detailed numbered actions |
| Direct client request, proposal needed | **High** | Full context + actions with due dates |
| Vendor notification needing review | **Medium** | Context + actions |
| Newsletter, auto-reply, verification code | **Low** | One sentence: "No action needed." |

## External vs Internal

- **External emails** (clients, vendors, partners): Extract tasks only. Never suggest drafts — clients don't want AI-generated responses
- **Internal emails** (colleagues, managers): Extract tasks + suggest what deliverable is needed (email-draft, PPT, proposal, spreadsheet, etc.)

---

## Quick Start

### 1. Enable IMAP in Gmail

Gmail Settings → Forwarding and POP/IMAP → Enable IMAP

### 2. Create a Gmail App Password

1. Enable 2-Step Verification at https://myaccount.google.com/security
2. Go to https://myaccount.google.com/apppasswords
3. Create an app password (16 characters)

### 3. Install

```bash
cp -r email-task-extractor email-briefing ~/.openclaw/hooks/
cp -r gmail-intel ~/.openclaw/skills/
```

### 4. Add credentials

Add to `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "email-task-extractor": {
          "enabled": true,
          "env": {
            "GMAIL_ACCOUNT": "your@gmail.com",
            "GMAIL_APP_PASSWORD": "xxxx xxxx xxxx xxxx",
            "ANTHROPIC_API_KEY": "sk-ant-..."
          }
        },
        "email-briefing": {
          "enabled": true,
          "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
        }
      }
    }
  }
}
```

### 5. Configure internal domains

Edit `~/.openclaw/hooks/email-task-extractor/handler.ts`:

```typescript
const INTERNAL_DOMAINS = ["yourcompany.com"];
```

### 6. Enable and restart

```bash
openclaw hooks enable email-task-extractor email-briefing
openclaw gateway restart
```

Emails start processing automatically every 10 minutes. Output: `~/Documents/email-tasks.csv`

---

## Architecture

- **IMAP polling** — no Gmail API, no OAuth, no GCP. Just IMAP + app password
- **Claude Haiku** — fast, cheap, accurate enough for email classification
- **CSV output** — open in Excel, Google Sheets, or any tool. No proprietary format
- **UID tracking** — processes emails incrementally, never re-processes the same email
- **10 per batch** — rate-limited to avoid API throttling, with automatic retry on 429
- **Read-only** — enforced in both the LLM prompt and code. Even if the AI hallucinates a send action, the code blocks it

## Guardrails

- The system prompt explicitly prohibits sending, replying, forwarding, or modifying emails
- External emails: `suggestedAction` is forcefully cleared in code regardless of LLM output
- Email body capped at 50KB before sending to AI
- App passwords (not full account credentials)
- No email bodies stored — only AI-generated summaries in the CSV

---

## Tech Stack

TypeScript, Node.js, IMAP over TLS, Claude Haiku API, Vitest for tests. Zero external databases or cloud dependencies.

## License

MIT
