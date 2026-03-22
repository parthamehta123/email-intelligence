---
name: email-briefing
description: "Delivers a prioritized morning email briefing. Reads last 24 hours from email-tasks.csv, groups by priority and category, shows email types and thread counts, surfaces tasks with suggested actions for internal items. Runs on cron or on demand."
metadata: {"openclaw":{"emoji":"🌅","events":["cron"],"requires":{"env":["ANTHROPIC_API_KEY"]}}}
---

# Email Briefing Hook

Reads the CSV produced by `email-task-extractor`, groups emails by priority, generates an AI summary of what needs attention, and delivers the briefing.

## Guardrails

Read only. Never sends anything. Never drafts anything for external clients.

## Schedule

Set up via CLI (every 10 minutes or morning briefing):

```bash
openclaw cron add --cron "*/10 * * * *" --name "email-briefing" \
  --message "Run email briefing" \
  --description "Email briefing every 10 minutes"
```

## On-Demand

Say "email briefing", "check emails", or "what's urgent" in any session.

## Enable

```bash
openclaw hooks enable email-briefing
```
