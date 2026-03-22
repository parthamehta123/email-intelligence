# Email Intelligence Pack

Read-only Gmail intelligence for a senior account manager. Monitors all emails, categorizes as Internal or External, extracts AI-summarized tasks, classifies email types, tracks threads, and delivers prioritized briefings. **Never sends anything.**

---

## How It Works

```
External emails → READ ONLY. Always High priority. Extract summarized tasks to CSV. Never draft or respond.
Internal emails → READ ONLY. Default Medium priority. Extract tasks. Suggest solutions (drafts, PPTs, quotes, proposals).
All emails      → Never send, reply, or modify inbox. Process every email. AI summarizes tasks clearly.
```

---

## What's Included

| Component | Type | Purpose |
|-----------|------|---------|
| `gmail-intel/` | Skill | On-demand email parsing + briefing when you ask |
| `email-task-extractor/` | Hook | Polls Gmail via IMAP, extracts AI-summarized tasks to CSV |
| `email-briefing/` | Hook | Morning briefing — reads CSV, summarizes by priority |

---

## Output

| File | Contents |
|------|----------|
| `~/Documents/email-tasks.csv` | Every email processed: priority, category, email type, summarized tasks, due dates, suggested actions, thread tracking |

CSV columns: `Date, From, Company, Subject, Priority, Category, EmailType, Task, Due, SuggestedAction, Status, ThreadId`

- **External tasks:** Always High priority. SuggestedAction is always empty (never draft for clients)
- **Internal tasks:** Default Medium priority. SuggestedAction can be: `email-draft`, `ppt`, `quote`, `proposal`, `contract-draft`, `citation`, `report`, `spreadsheet`
- **Task column:** AI-summarized actionable items — never raw email text
- **ThreadId:** Links related emails in the same thread

---

## Installation

### Step 1 — Copy files

```bash
cp -r gmail-intel ~/.openclaw/skills/
cp -r email-task-extractor email-briefing ~/.openclaw/hooks/
```

### Step 2 — Enable IMAP in Gmail

Gmail → Settings → Forwarding and POP/IMAP → make sure IMAP is enabled. Most accounts have it on by default.

### Step 3 — Create a Gmail App Password

1. Enable 2-Step Verification at https://myaccount.google.com/security (if not already on)
2. Go to https://myaccount.google.com/apppasswords
3. Type `openclaw` as the app name, click Create
4. Copy the 16-character password

### Step 4 — Add credentials to ~/.openclaw/openclaw.json

Add env vars to both hooks and the skill. The hooks need credentials to poll Gmail and call Claude:

```json
{
  "hooks": {
    "enabled": true,
    "token": "YOUR_HOOK_TOKEN",
    "internal": {
      "enabled": true,
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
          "env": {
            "ANTHROPIC_API_KEY": "sk-ant-..."
          }
        }
      }
    }
  },
  "skills": {
    "entries": {
      "gmail-intel": {
        "enabled": true,
        "env": {
          "GMAIL_ACCOUNT": "your@gmail.com",
          "GMAIL_APP_PASSWORD": "xxxx xxxx xxxx xxxx",
          "ANTHROPIC_API_KEY": "sk-ant-..."
        }
      }
    }
  }
}
```

### Step 5 — Enable hooks

```bash
openclaw hooks enable email-task-extractor
openclaw hooks enable email-briefing
```

### Step 6 — Add cron jobs

```bash
# Poll Gmail every 10 minutes (processes 10 emails per batch, 100/day max)
openclaw cron add --cron "*/10 * * * *" --name "email-poll" \
  --message "check emails" --description "Poll Gmail via IMAP" \
  --session isolated --no-deliver

# Morning briefing at 8:30 AM weekdays
openclaw cron add --cron "30 8 * * 1-5" --name "email-briefing" \
  --message "Run morning email briefing" \
  --description "Morning email briefing"
```

### Step 7 — Add your internal domains

Edit `~/.openclaw/hooks/email-task-extractor/handler.ts`:

```typescript
const INTERNAL_DOMAINS = [
  "clarivate.com",
  "clarivate.io",
  // add your domains here
];
```

Restart the gateway: `openclaw gateway restart`

---

## Usage

```
"check emails"               → Full briefing of recent emails
"what's urgent"              → Critical + High only
"email tasks"                → All tasks extracted from emails
"parse emails from Acme"     → Focus on specific sender
"any client emails I missed" → External only

[Automatic]
→ Every 10 min: polls Gmail, processes 10 emails per batch
→ Critical/High emails: immediate alert
→ 8:30 AM weekdays: morning briefing
→ Daily limit: 100 emails/day (resets at midnight)
```

---

## Morning Briefing Example

```
📬 Email Briefing — Tue 18 Mar
12 emails | 7 external | 5 internal | 4 tasks | 8 threads

💡 Two client renewals need attention — Acme and TechCorp both have
   outstanding proposals. One internal escalation needs a response today.

🟠 HIGH (3)
• john@acme.com — Re: Q2 Renewal Discussion [contract-discussion]
  → Review and send updated renewal proposal | Due: 2026-03-19
• sarah@techcorp.com — Pricing query for enterprise tier [proposal-request]
  → Prepare and share pricing deck | Due: This week
• manager@clarivate.com — Escalation: TechCorp account [escalation]
  → Prepare account status update with key metrics | Due: ASAP [email-draft]

🟡 MEDIUM (1)
• ops@clarivate.com — Q1 pipeline review next week [meeting-request]
  → Compile pipeline numbers for review meeting | Due: 2026-03-24 [spreadsheet]
```

---

## Processing Model

- **No dedup**: Every email gets its own CSV row. Follow-ups, reminders, and thread replies all appear individually.
- **Batch processing**: 10 emails per cron run (every 10 minutes)
- **Daily rate limit**: 100 emails/day, resets at midnight
- **No lookback limit**: First run processes all historical emails. Subsequent runs pick up where they left off using UID tracking.
- **Thread tracking**: Emails in the same thread share a ThreadId (from References/In-Reply-To headers)
- **AI summarization**: Tasks are always properly summarized — never raw email text dumps

---

## Priority Rules

| Category | Priority | Rule |
|----------|----------|------|
| External | Always High | Every client/vendor email is High priority |
| Internal | Default Medium | Raised to High/Critical only for clear urgency |
| Internal | Low | Only for pure FYI/no-action emails |

---

## Guardrails

- External emails: tasks only, no drafts ever (clients hate AI slop)
- Internal emails: tasks + suggested actions (drafts, PPTs, quotes, proposals, contracts, citations)
- The handler enforces this in code — even if the LLM suggests an action for an external email, it gets stripped
- All suggested actions are just labels — the agent doesn't auto-generate them, it flags what type of deliverable is needed
