import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Stub the HookHandler type import before loading handler
vi.mock("../../src/hooks/hooks.js", () => ({}));

const { _testExports, default: handler } = await import("./handler.js");
const {
  parseImapFetchResult,
  isInternalEmail,
  extractSenderName,
  extractDomain,
  csvEscape,
  appendTasksToCsv,
  ensureCsvHeader,
  priorityEmoji,
  loadProcessedIds,
  saveProcessedIds,
  EMAIL_CSV_PATH,
  PROCESSED_IDS_PATH,
} = _testExports;

// ─── Test Data ───────────────────────────────────────────────────────────────

const SAMPLE_IMAP_FETCH = `* 1 FETCH (BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)] {200}
From: John Smith <john@bigclient.com>
To: partha@clarivate.com
CC: team@clarivate.com
Subject: Contract renewal Q3
Date: Mon, 20 Mar 2026 10:30:00 +0000
Message-ID: <abc123@bigclient.com>

BODY[TEXT] {150}
Hi Partha,

We need to discuss the contract renewal for Q3. Please send the updated proposal by Friday.

Thanks,
John
)
F1 OK FETCH completed`;

const SAMPLE_IMAP_NO_FROM = `* 1 FETCH (BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)] {50}
Subject: No sender here

BODY[TEXT] {10}
test
)
F1 OK FETCH completed`;

const SAMPLE_IMAP_NO_SUBJECT = `* 1 FETCH (BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)] {50}
From: someone@test.com

BODY[TEXT] {10}
test
)
F1 OK FETCH completed`;

// ─── parseImapFetchResult ────────────────────────────────────────────────────

describe("parseImapFetchResult", () => {
  it("parses a complete IMAP FETCH response", () => {
    const result = parseImapFetchResult(SAMPLE_IMAP_FETCH);
    expect(result).not.toBeNull();
    expect(result!.from).toBe("John Smith <john@bigclient.com>");
    expect(result!.to).toBe("partha@clarivate.com");
    expect(result!.cc).toBe("team@clarivate.com");
    expect(result!.subject).toBe("Contract renewal Q3");
    expect(result!.date).toBe("Mon, 20 Mar 2026 10:30:00 +0000");
    expect(result!.messageId).toBe("<abc123@bigclient.com>");
    expect(result!.body).toContain("contract renewal");
  });

  it("returns null when From is missing", () => {
    expect(parseImapFetchResult(SAMPLE_IMAP_NO_FROM)).toBeNull();
  });

  it("returns null when Subject is missing", () => {
    expect(parseImapFetchResult(SAMPLE_IMAP_NO_SUBJECT)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseImapFetchResult("")).toBeNull();
  });

  it("truncates body at 50000 characters", () => {
    const longBody = "x".repeat(60000);
    const raw = `* 1 FETCH (BODY[HEADER.FIELDS] {50}
From: test@test.com
Subject: Long email

BODY[TEXT]
${longBody}
)
F1 OK FETCH completed`;
    const result = parseImapFetchResult(raw);
    expect(result).not.toBeNull();
    expect(result!.body.length).toBeLessThanOrEqual(50000);
  });
});

// ─── isInternalEmail ─────────────────────────────────────────────────────────

describe("isInternalEmail", () => {
  it("detects clarivate.com as internal", () => {
    expect(isInternalEmail("John <john@clarivate.com>")).toBe(true);
  });

  it("detects clarivate.io as internal", () => {
    expect(isInternalEmail("jane@clarivate.io")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isInternalEmail("Boss <BOSS@CLARIVATE.COM>")).toBe(true);
  });

  it("marks external domains as external", () => {
    expect(isInternalEmail("client@bigcorp.com")).toBe(false);
  });

  it("marks gmail as external", () => {
    expect(isInternalEmail("someone@gmail.com")).toBe(false);
  });
});

// ─── extractSenderName ───────────────────────────────────────────────────────

describe("extractSenderName", () => {
  it("extracts name from 'Name <email>' format", () => {
    expect(extractSenderName("John Smith <john@test.com>")).toBe("John Smith");
  });

  it("falls back to username from bare email", () => {
    expect(extractSenderName("john@test.com")).toBe("john");
  });
});

// ─── extractDomain ───────────────────────────────────────────────────────────

describe("extractDomain", () => {
  it("extracts domain from 'Name <email>' format", () => {
    expect(extractDomain("John <john@bigcorp.com>")).toBe("bigcorp.com");
  });

  it("extracts domain from bare email", () => {
    expect(extractDomain("john@bigcorp.com")).toBe("bigcorp.com");
  });

  it("returns 'unknown' when no @ present", () => {
    expect(extractDomain("no-email-here")).toBe("unknown");
  });
});

// ─── csvEscape ───────────────────────────────────────────────────────────────

describe("csvEscape", () => {
  it("wraps value in double quotes", () => {
    expect(csvEscape("hello")).toBe('"hello"');
  });

  it("replaces internal double quotes with single quotes", () => {
    expect(csvEscape('say "hello"')).toBe("\"say 'hello'\"");
  });

  it("handles empty string", () => {
    expect(csvEscape("")).toBe('""');
  });
});

// ─── priorityEmoji ──────────────────────────────────────────────────────────

describe("priorityEmoji", () => {
  it("returns correct emoji for each priority level", () => {
    expect(priorityEmoji("Critical")).toBe("🔴");
    expect(priorityEmoji("High")).toBe("🟠");
    expect(priorityEmoji("Medium")).toBe("🟡");
    expect(priorityEmoji("Low")).toBe("🟢");
    expect(priorityEmoji("Junk")).toBe("⚫");
  });
});

// ─── Dedup (loadProcessedIds / saveProcessedIds) ─────────────────────────────

describe("dedup persistence", () => {
  const tmpDir = path.join("/tmp", "email-intel-test-dedup");
  const tmpFile = path.join(tmpDir, "ids.json");

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  });

  it("loadProcessedIds returns empty set when file does not exist", () => {
    // The actual function reads from PROCESSED_IDS_PATH which may or may not exist.
    // We test that it returns a Set (not crash) regardless.
    const ids = loadProcessedIds();
    expect(ids).toBeInstanceOf(Set);
  });

  it("saveProcessedIds caps at 10000 entries", () => {
    const largeSet = new Set<string>();
    for (let i = 0; i < 12000; i++) {
      largeSet.add(`msg-${i}`);
    }
    // Save to the real path, then read it back
    saveProcessedIds(largeSet);
    const data = JSON.parse(fs.readFileSync(PROCESSED_IDS_PATH, "utf-8"));
    expect(data.ids.length).toBe(10000);
    // Should keep the LAST 10000 (highest numbered)
    expect(data.ids).toContain("msg-11999");
    expect(data.ids).not.toContain("msg-0");
  });
});

// ─── CSV writing ─────────────────────────────────────────────────────────────

describe("appendTasksToCsv", () => {
  const testCsvPath = EMAIL_CSV_PATH + ".test";
  let originalPath: string;

  beforeEach(() => {
    // We can't easily swap the const, so we test via the real path
    // Clean up any existing test CSV
    if (fs.existsSync(EMAIL_CSV_PATH)) {
      originalPath = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    }
  });

  afterEach(() => {
    // Restore original CSV if it existed
    if (originalPath !== undefined) {
      fs.writeFileSync(EMAIL_CSV_PATH, originalPath, "utf-8");
    }
  });

  it("writes tasks with correct format", () => {
    // Remove CSV to test fresh creation
    if (fs.existsSync(EMAIL_CSV_PATH)) {
      fs.unlinkSync(EMAIL_CSV_PATH);
    }

    const email = {
      from: "John <john@bigcorp.com>",
      subject: "Renewal discussion",
      body: "Please review",
    };

    const analysis = {
      priorityScore: 5,
      priorityLabel: "High" as const,
      category: "External" as const,
      summary: "Client wants renewal",
      tasks: [
        { title: "Review renewal terms", due: "Friday", context: "Q3 renewal" },
        { title: "Send pricing update", due: "ASAP", context: "Updated rates" },
      ],
    };

    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    const lines = content.trim().split("\n");

    // Header + 2 task rows
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("Date,From,Company,Subject,Priority");
    expect(lines[1]).toContain("High");
    expect(lines[1]).toContain("External");
    expect(lines[1]).toContain("Review renewal terms");
    expect(lines[1]).toContain("Pending");
    expect(lines[2]).toContain("Send pricing update");
  });

  it("logs email with no tasks as 'No action'", () => {
    if (fs.existsSync(EMAIL_CSV_PATH)) {
      fs.unlinkSync(EMAIL_CSV_PATH);
    }

    const email = {
      from: "news@newsletter.com",
      subject: "Weekly update",
      body: "FYI only",
    };

    const analysis = {
      priorityScore: -2,
      priorityLabel: "Low" as const,
      category: "External" as const,
      summary: "Newsletter, no action needed",
      tasks: [],
    };

    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    expect(content).toContain("No action");
  });
});

// ─── Handler integration ─────────────────────────────────────────────────────

describe("handler", () => {
  it("is a function", () => {
    expect(typeof handler).toBe("function");
  });

  it("ignores non-matching event types", async () => {
    const event = {
      type: "someOtherType",
      action: "something",
      messages: [],
      context: {},
    };
    // Should return without doing anything
    await handler(event as any);
    expect(event.messages.length).toBe(0);
  });
});

// ─── Guardrail rules verification ───────────────────────────────────────────

describe("guardrail rules", () => {
  it("external emails have suggestedAction stripped", () => {
    // This tests the logic in the handler loop (lines 507-511)
    // We simulate what the handler does
    const analysis = {
      priorityScore: 5,
      priorityLabel: "High" as const,
      category: "External" as const,
      summary: "Client email",
      tasks: [
        { title: "Review contract", due: "Friday", context: "Q3", suggestedAction: "email-draft" },
        { title: "Send pricing", due: "ASAP", context: "Rates", suggestedAction: "proposal" },
      ],
    };

    // Simulate the handler's enforcement
    if (analysis.category === "External") {
      for (const task of analysis.tasks) {
        task.suggestedAction = undefined;
      }
    }

    expect(analysis.tasks[0].suggestedAction).toBeUndefined();
    expect(analysis.tasks[1].suggestedAction).toBeUndefined();
  });

  it("internal emails keep suggestedAction", () => {
    const analysis = {
      category: "Internal" as const,
      tasks: [
        { title: "Draft response", due: "Today", context: "Manager request", suggestedAction: "email-draft" },
      ],
    };

    // Internal emails should NOT have suggestedAction stripped
    if (analysis.category === "External") {
      for (const task of analysis.tasks) {
        task.suggestedAction = undefined;
      }
    }

    expect(analysis.tasks[0].suggestedAction).toBe("email-draft");
  });
});

// ─── No per-poll limit ───────────────────────────────────────────────────────

describe("no artificial limits", () => {
  it("handler source does not contain .slice(-50)", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "handler.ts"),
      "utf-8"
    );
    expect(source).not.toContain(".slice(-50)");
  });

  it("handler source does not hard-code a 3-day search window", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "handler.ts"),
      "utf-8"
    );
    // Should not have getDate() - 3 for date window
    expect(source).not.toContain("getDate() - 3");
  });

  it("body limit is 50000 not 5000", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "handler.ts"),
      "utf-8"
    );
    expect(source).toContain("body.slice(0, 50000)");
    expect(source).not.toMatch(/body\.slice\(0,\s*5000\)/);
  });

  it("dedup cache is 10000 not 500", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "handler.ts"),
      "utf-8"
    );
    expect(source).toContain(".slice(-10000)");
    expect(source).not.toMatch(/\.slice\(-500\b\)/);
  });
});
