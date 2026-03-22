import type { HookHandler } from "../../src/hooks/hooks.js";
import * as fs from "fs";
import * as path from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_CSV_PATH = path.join(
  process.env.HOME ?? "~",
  "Documents",
  "email-tasks.csv"
);
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CsvRow {
  date: string;
  from: string;
  company: string;
  subject: string;
  priority: string;
  category: string;
  emailType: string;
  task: string;
  due: string;
  suggestedAction: string;
  status: string;
  threadId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadConfigEnv(): Record<string, string> {
  try {
    const configPath = path.join(process.env.HOME ?? "", ".openclaw", "openclaw.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config?.hooks?.internal?.entries?.["email-briefing"]?.env ?? {};
    }
  } catch { /* fall through */ }
  return {};
}

function priorityEmoji(priority: string): string {
  const map: Record<string, string> = {
    Critical: "🔴",
    High: "🟠",
    Medium: "🟡",
    Low: "🟢",
  };
  return map[priority] ?? "⚪";
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split("\n").slice(1); // skip header
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const fields: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          fields.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      fields.push(current.trim());

      return {
        date: fields[0] ?? "",
        from: fields[1] ?? "",
        company: fields[2] ?? "",
        subject: fields[3] ?? "",
        priority: fields[4] ?? "",
        category: fields[5] ?? "",
        emailType: fields[6] ?? "",
        task: fields[7] ?? "",
        due: fields[8] ?? "",
        suggestedAction: fields[9] ?? "",
        status: fields[10] ?? "",
        threadId: fields[11] ?? "",
      };
    });
}

function getLast24HoursRows(rows: CsvRow[]): CsvRow[] {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cutoffStr && r.status === "Pending");
}

async function generateBriefingSummary(rows: CsvRow[], apiKey: string): Promise<string> {
  if (rows.length === 0) return "";

  const rowSummary = rows
    .map(
      (r) =>
        `[${r.priority}] [${r.category}] [${r.emailType}] ${r.from} — ${r.subject} | Task: ${r.task} | Due: ${r.due}${r.suggestedAction ? ` | Action: ${r.suggestedAction}` : ""}`
    )
    .join("\n");

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system:
          "You are a chief of staff summarizing emails for a senior account manager. Be concise, specific, and action-oriented. Never suggest sending anything to external clients.",
        messages: [
          {
            role: "user",
            content: `Write a 2-3 sentence executive summary of what needs attention today based on these emails:\n\n${rowSummary}`,
          },
        ],
      }),
    });

    if (!response.ok) return "";
    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content?.map((b) => b.text || "").join("") ?? "";
  } catch {
    return "";
  }
}

// ─── Hook Handler ─────────────────────────────────────────────────────────────

const handler: HookHandler = async (event) => {
  if (event.type !== "cron") return;

  void (async () => {
    try {
      if (!fs.existsSync(EMAIL_CSV_PATH)) {
        event.messages.push(
          "📬 No email log found yet. Email tracking will start once the Gmail integration is active."
        );
        return;
      }

      const configEnv = loadConfigEnv();
      const apiKey = process.env.ANTHROPIC_API_KEY ?? configEnv.ANTHROPIC_API_KEY ?? "";

      const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
      const allRows = parseCsv(content);
      const recentRows = getLast24HoursRows(allRows);

      if (recentRows.length === 0) {
        event.messages.push("📬 *Email Briefing* — No pending email tasks from the last 24 hours. Inbox is clear.");
        return;
      }

      // Group by priority
      const byPriority: Record<string, CsvRow[]> = {
        Critical: [],
        High: [],
        Medium: [],
        Low: [],
      };

      for (const row of recentRows) {
        const bucket = byPriority[row.priority];
        if (bucket) bucket.push(row);
      }

      const external = recentRows.filter((r) => r.category === "External").length;
      const internal = recentRows.filter((r) => r.category === "Internal").length;
      const withTasks = recentRows.filter((r) => r.task && r.status === "Pending").length;

      // Count unique threads
      const threadIds = new Set(recentRows.map((r) => r.threadId).filter(Boolean));

      // Generate AI summary
      const aiSummary = apiKey
        ? await generateBriefingSummary(
            recentRows.filter((r) => ["Critical", "High"].includes(r.priority)),
            apiKey
          )
        : "";

      const lines: string[] = [
        `📬 *Email Briefing — ${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}*`,
        `${recentRows.length} emails | ${external} external | ${internal} internal | ${withTasks} tasks | ${threadIds.size} threads`,
        "",
      ];

      if (aiSummary) {
        lines.push(`💡 _${aiSummary}_`, "");
      }

      for (const [priority, rows] of Object.entries(byPriority)) {
        if (rows.length === 0) continue;
        lines.push(`${priorityEmoji(priority)} *${priority.toUpperCase()} (${rows.length})*`);
        for (const row of rows) {
          let taskLine = `• ${row.from} — _${row.subject}_ [${row.emailType}]`;
          if (row.task && row.status === "Pending") {
            taskLine += `\n  → ${row.task}`;
            if (row.due) taskLine += ` | Due: ${row.due}`;
            if (row.suggestedAction) taskLine += ` [${row.suggestedAction}]`;
          }
          lines.push(taskLine);
        }
        lines.push("");
      }

      lines.push(`Say *"email tasks"* to see your full task list.`);
      event.messages.push(lines.join("\n"));
    } catch (err) {
      console.error(
        "[email-briefing] Error:",
        err instanceof Error ? err.message : String(err)
      );
    }
  })();
};

export default handler;
