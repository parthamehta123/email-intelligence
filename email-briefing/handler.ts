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
  from: string;
  subject: string;
  tasks: string;
  suggestedAction: string;
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
        from: fields[0] ?? "",
        subject: fields[1] ?? "",
        tasks: fields[2] ?? "",
        suggestedAction: fields[3] ?? "",
      };
    });
}

function getRecentRows(rows: CsvRow[]): CsvRow[] {
  // Return all rows — no date filtering since CSV has no date column
  return rows;
}

async function generateBriefingSummary(rows: CsvRow[], apiKey: string): Promise<string> {
  if (rows.length === 0) return "";

  const rowSummary = rows
    .map(
      (r) =>
        `${r.from} — ${r.subject} | Tasks: ${r.tasks || "None"}${r.suggestedAction ? ` | Action: ${r.suggestedAction}` : ""}`
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
      const rows = getRecentRows(allRows);

      if (rows.length === 0) {
        event.messages.push("📬 *Email Briefing* — No emails processed yet.");
        return;
      }

      // Generate AI summary
      const aiSummary = apiKey
        ? await generateBriefingSummary(rows.slice(-20), apiKey)
        : "";

      const lines: string[] = [
        `📬 *Email Briefing — ${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}*`,
        `${rows.length} emails processed`,
        "",
      ];

      if (aiSummary) {
        lines.push(`💡 _${aiSummary}_`, "");
      }

      for (const row of rows.slice(-20)) {
        let taskLine = `• ${row.from} — _${row.subject}_`;
        if (row.tasks) {
          taskLine += `\n  → ${row.tasks}`;
          if (row.suggestedAction) taskLine += ` [${row.suggestedAction}]`;
        }
        lines.push(taskLine);
      }

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
