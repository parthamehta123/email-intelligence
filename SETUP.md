# Quick Setup

## 1. Enable IMAP in Gmail

Gmail Settings → Forwarding and POP/IMAP → Enable IMAP → Save.

## 2. Create an App Password

1. Enable 2-Step Verification at https://myaccount.google.com/security
2. Go to https://myaccount.google.com/apppasswords
3. Create password, copy the 16 characters

## 3. Install files

```bash
cp -r email-task-extractor email-briefing ~/.openclaw/hooks/
cp -r gmail-intel ~/.openclaw/skills/
```

## 4. Add credentials to ~/.openclaw/openclaw.json

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
  "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
}
```

## 5. Configure preferences

Copy the example config and edit:

```bash
cp email-intelligence.example.json ~/.openclaw/email-intelligence.json
```

Edit `~/.openclaw/email-intelligence.json`:

```json
{
  "csv": {
    "includeInternal": true,
    "includeExternal": true
  },
  "notify": {
    "enabled": true,
    "categories": ["External"],
    "skipTypes": ["newsletter", "auto-reply", "calendar-invite", "information-sharing"]
  },
  "internalDomains": ["yourcompany.com"]
}
```

- `csv` — choose which emails appear in the spreadsheet
- `notify` — choose which emails trigger WhatsApp/Telegram notifications
- `internalDomains` — your company's email domains

## 6. Enable and restart

```bash
openclaw hooks enable email-task-extractor email-briefing
openclaw gateway restart
```

## 7. WhatsApp notifications (optional)

Get a summary on WhatsApp every time emails are processed:

```bash
openclaw cron add --cron "*/10 * * * *" --name "email-poll" \
  --message "email poll" --session isolated \
  --announce --to "+91XXXXXXXXXX" --light-context
```

Replace `+91XXXXXXXXXX` with the recipient's phone number (E.164 format with country code).

## Done

- Emails processed every 10 minutes (10 per batch)
- Output: `~/Documents/email-tasks.csv`
- 4 columns: From, Subject, Tasks, SuggestedAction
- Open in Excel — scan, understand, act
- WhatsApp notification after each batch (if configured)
