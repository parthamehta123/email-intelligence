---
name: email-briefing
description: "Reads email-tasks.csv, generates an AI summary of what needs attention, and delivers a briefing. Runs on cron or on demand."
metadata: {"openclaw":{"emoji":"🌅","events":["cron"],"requires":{"env":["ANTHROPIC_API_KEY"]}}}
---

# Email Briefing Hook

Reads the CSV produced by `email-task-extractor`, generates an AI summary of what needs attention, and delivers the briefing.

## Guardrails

Read only. Never sends anything. Never drafts anything for external clients.

## On-Demand

Say "email briefing", "check emails", or "what's urgent" in any session.

## Enable

```bash
openclaw hooks enable email-briefing
```
