---
name: email-briefing
description: "Delivers a prioritized morning email briefing. Reads the last 24 hours from email-tasks.csv, groups by priority and category (External/Internal), surfaces tasks with suggested actions for internal items. Runs on cron or on demand."
metadata: {"openclaw":{"emoji":"🌅","events":["cron"],"requires":{"env":["ANTHROPIC_API_KEY"]}}}
---

# Email Briefing Hook

Reads the CSV produced by `email-task-extractor`, groups emails by priority, generates an AI summary of what needs attention, and delivers the briefing.

## Guardrails

Read only. Never sends anything. Never drafts anything for external clients.

## Schedule

Set up via CLI:

```bash
openclaw cron add --cron "30 8 * * 1-5" --name "email-briefing" \
  --message "Run morning email briefing" \
  --description "Morning email briefing at 8:30 AM weekdays"
```

## On-Demand

Say "email briefing", "check emails", or "what's urgent" in any session.

## Enable

```bash
openclaw hooks enable email-briefing
```
