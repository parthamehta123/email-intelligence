# Quick Setup

## 1. Enable IMAP in Gmail

Gmail → Settings → Forwarding and POP/IMAP → make sure IMAP is enabled → Save. Most accounts have it on by default.

## 2. Create an App Password

1. Enable 2-Step Verification at https://myaccount.google.com/security
2. Go to https://myaccount.google.com/apppasswords
3. Type `openclaw`, click Create
4. Copy the 16-character password (looks like `abcd efgh ijkl mnop`)

## 3. Install files

```bash
cp -r gmail-intel ~/.openclaw/skills/
cp -r email-task-extractor email-briefing ~/.openclaw/hooks/
```

## 4. Add credentials to ~/.openclaw/openclaw.json

Find the `hooks.internal.entries` section and add env vars to both hooks:

```json
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
```

Also add the same to the `gmail-intel` skill under `skills.entries`.

## 5. Edit your internal domains

Open `~/.openclaw/hooks/email-task-extractor/handler.ts` and update:

```typescript
const INTERNAL_DOMAINS = [
  "yourcompany.com",
  // add more
];
```

## 6. Enable and set up cron

```bash
openclaw hooks enable email-task-extractor
openclaw hooks enable email-briefing

# Poll every 10 minutes, batch of 10 emails, 100/day max
openclaw cron add --cron "*/10 * * * *" --name "email-poll" \
  --message "check emails" --session isolated --no-deliver

# Morning briefing at 8:30 AM weekdays
openclaw cron add --cron "30 8 * * 1-5" --name "email-briefing" \
  --message "Run morning email briefing"

openclaw gateway restart
```

## Done

- Emails polled every 10 minutes (10 per batch, 100/day max)
- Tasks written to `~/Documents/email-tasks.csv`
- Morning briefing at 8:30 AM weekdays
- Say "check emails" or "email tasks" anytime
- Every email gets processed — no dedup, no skipping
- AI summarizes tasks clearly — never raw email text
- Threads tracked via ThreadId column
