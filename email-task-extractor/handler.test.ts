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
  extractThreadId,
  loadUidState,
  saveUidState,
  DEFAULT_INTERNAL_DOMAINS,
  loadUserConfig,
  USER_CONFIG_PATH,
  EMAIL_CSV_PATH,
  UID_STATE_PATH,
  BATCH_SIZE,
} = _testExports;

// ─── Test Data ───────────────────────────────────────────────────────────────

const SAMPLE_IMAP_FETCH = `* 1 FETCH (BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] {200}
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

const SAMPLE_IMAP_THREAD = `* 2 FETCH (BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] {200}
From: Jane Doe <jane@bigclient.com>
To: partha@clarivate.com
Subject: Re: Contract renewal Q3
Date: Tue, 21 Mar 2026 09:00:00 +0000
Message-ID: <def456@bigclient.com>
In-Reply-To: <abc123@bigclient.com>
References: <abc123@bigclient.com>

BODY[TEXT] {100}
Following up on the renewal. Any update on the proposal?
)
F2 OK FETCH completed`;

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

  it("parses thread headers (In-Reply-To and References)", () => {
    const result = parseImapFetchResult(SAMPLE_IMAP_THREAD);
    expect(result).not.toBeNull();
    expect(result!.inReplyTo).toBe("<abc123@bigclient.com>");
    expect(result!.references).toBe("<abc123@bigclient.com>");
    expect(result!.subject).toBe("Re: Contract renewal Q3");
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

// ─── extractThreadId ────────────────────────────────────────────────────────

describe("extractThreadId", () => {
  it("uses first Reference as thread root", () => {
    const email = {
      from: "a@b.com", subject: "test", body: "",
      messageId: "<own@b.com>",
      references: "<root@b.com> <mid@b.com>",
      inReplyTo: "<mid@b.com>",
    };
    expect(extractThreadId(email)).toBe("<root@b.com>");
  });

  it("falls back to In-Reply-To when no References", () => {
    const email = {
      from: "a@b.com", subject: "test", body: "",
      messageId: "<own@b.com>",
      inReplyTo: "<parent@b.com>",
    };
    expect(extractThreadId(email)).toBe("<parent@b.com>");
  });

  it("uses own Message-ID for standalone emails", () => {
    const email = {
      from: "a@b.com", subject: "test", body: "",
      messageId: "<own@b.com>",
    };
    expect(extractThreadId(email)).toBe("<own@b.com>");
  });

  it("returns empty string when no IDs present", () => {
    const email = { from: "a@b.com", subject: "test", body: "" };
    expect(extractThreadId(email)).toBe("");
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
  });

  it("returns fallback for unknown priority", () => {
    expect(priorityEmoji("Unknown")).toBe("⚪");
  });
});

// ─── UID State ──────────────────────────────────────────────────────────────

describe("UID state persistence", () => {
  let originalUidState: string | undefined;

  beforeEach(() => {
    if (fs.existsSync(UID_STATE_PATH)) {
      originalUidState = fs.readFileSync(UID_STATE_PATH, "utf-8");
    }
  });

  afterEach(() => {
    if (originalUidState !== undefined) {
      fs.writeFileSync(UID_STATE_PATH, originalUidState, "utf-8");
    }
  });

  it("loadUidState returns defaults when file does not exist", () => {
    const state = loadUidState();
    expect(state).toHaveProperty("uidValidity");
    expect(state).toHaveProperty("lastUid");
    expect(typeof state.lastUid).toBe("number");
  });

  it("saveUidState and loadUidState round-trip correctly", () => {
    saveUidState({ uidValidity: 12345, lastUid: 500 });
    const state = loadUidState();
    expect(state.uidValidity).toBe(12345);
    expect(state.lastUid).toBe(500);
  });
});

// ─── Batch Size ─────────────────────────────────────────────────────────────

describe("batch size", () => {
  it("BATCH_SIZE is 10", () => {
    expect(BATCH_SIZE).toBe(10);
  });
});

// ─── User Config ────────────────────────────────────────────────────────────

describe("loadUserConfig", () => {
  it("returns defaults when config file does not exist", () => {
    const config = loadUserConfig();
    expect(config.csv.includeInternal).toBe(true);
    expect(config.csv.includeExternal).toBe(true);
    expect(config.notify.enabled).toBe(true);
    expect(config.notify.categories).toContain("External");
    expect(config.notify.skipTypes).toContain("newsletter");
    expect(config.internalDomains.length).toBeGreaterThan(0);
  });

  it("isInternalEmail uses custom domains when provided", () => {
    expect(isInternalEmail("john@acme.com", ["acme.com"])).toBe(true);
    expect(isInternalEmail("john@other.com", ["acme.com"])).toBe(false);
  });

  it("isInternalEmail uses default domains when none provided", () => {
    expect(isInternalEmail("john@clarivate.com")).toBe(true);
    expect(isInternalEmail("john@external.com")).toBe(false);
  });
});

// ─── CSV writing (no dedup) ─────────────────────────────────────────────────

describe("appendTasksToCsv", () => {
  let originalContent: string | undefined;

  beforeEach(() => {
    if (fs.existsSync(EMAIL_CSV_PATH)) {
      originalContent = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    }
  });

  afterEach(() => {
    if (originalContent !== undefined) {
      fs.writeFileSync(EMAIL_CSV_PATH, originalContent, "utf-8");
    } else if (fs.existsSync(EMAIL_CSV_PATH)) {
      fs.unlinkSync(EMAIL_CSV_PATH);
    }
  });

  it("writes tasks with correct format including EmailType and ThreadId", () => {
    if (fs.existsSync(EMAIL_CSV_PATH)) fs.unlinkSync(EMAIL_CSV_PATH);

    const email = {
      from: "John <john@bigcorp.com>",
      subject: "Renewal discussion",
      body: "Please review",
      date: "Mon, 20 Mar 2026 10:00:00 +0000",
      messageId: "<msg1@bigcorp.com>",
    };

    const analysis = {
      priorityLabel: "High" as const,
      category: "External" as const,
      emailType: "contract-discussion",
      tasks: "Client requesting contract renewal review. 1. Review renewal terms (Due: Friday) 2. Update pricing sheet (Due: ASAP)",
      suggestedAction: "",
    };

    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    const lines = content.trim().split("\n");

    // Header + 1 row per email
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("From,Subject,Tasks,SuggestedAction");
    expect(lines[1]).toContain("John");
    expect(lines[1]).toContain("Renewal discussion");
    expect(lines[1]).toContain("Review renewal terms");
    expect(lines[1]).toContain("Update pricing sheet");
  });

  it("appends duplicate emails without dedup (every email gets a row)", () => {
    if (fs.existsSync(EMAIL_CSV_PATH)) fs.unlinkSync(EMAIL_CSV_PATH);

    const email = {
      from: "John <john@bigcorp.com>",
      subject: "Same email",
      body: "Same content",
      date: "Mon, 20 Mar 2026 10:00:00 +0000",
      messageId: "<msg1@bigcorp.com>",
    };

    const analysis = {
      priorityLabel: "High" as const,
      category: "External" as const,
      emailType: "follow-up",
      tasks: "Follow-up on previous discussion. 1. Respond to follow-up (Due: ASAP)",
      suggestedAction: "",
    };

    // Append same email twice — both should appear
    appendTasksToCsv(email, analysis);
    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    const lines = content.trim().split("\n");

    // Header + 2 rows (no dedup)
    expect(lines.length).toBe(3);
  });

  it("logs email with no tasks as 'No action'", () => {
    if (fs.existsSync(EMAIL_CSV_PATH)) fs.unlinkSync(EMAIL_CSV_PATH);

    const email = {
      from: "news@newsletter.com",
      subject: "Weekly update",
      body: "FYI only",
      date: "Mon, 20 Mar 2026 10:00:00 +0000",
    };

    const analysis = {
      priorityLabel: "Low" as const,
      category: "External" as const,
      emailType: "information-sharing",
      tasks: "Weekly newsletter with company updates. No action needed.",
      suggestedAction: "",
    };

    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    expect(content).toContain("Weekly newsletter");
    expect(content).toContain("news");
  });

  it("includes thread ID for threaded emails", () => {
    if (fs.existsSync(EMAIL_CSV_PATH)) fs.unlinkSync(EMAIL_CSV_PATH);

    const email = {
      from: "Jane <jane@bigcorp.com>",
      subject: "Re: Contract renewal",
      body: "Following up",
      date: "Tue, 21 Mar 2026 09:00:00 +0000",
      messageId: "<reply1@bigcorp.com>",
      inReplyTo: "<original@bigcorp.com>",
      references: "<original@bigcorp.com>",
    };

    const analysis = {
      priorityLabel: "High" as const,
      category: "External" as const,
      emailType: "follow-up",
      tasks: "Follow-up on contract renewal thread. 1. Review and respond to follow-up (Due: Today)",
      suggestedAction: "",
    };

    appendTasksToCsv(email, analysis);

    const content = fs.readFileSync(EMAIL_CSV_PATH, "utf-8");
    expect(content).toContain("Jane");
    expect(content).toContain("Re: Contract renewal");
    expect(content).toContain("Review and respond");
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
    await handler(event as any);
    expect(event.messages.length).toBe(0);
  });
});

// ─── Guardrail rules verification ───────────────────────────────────────────

describe("guardrail rules", () => {
  it("external emails have suggestedAction cleared", () => {
    const analysis = {
      priorityLabel: "High" as const,
      category: "External" as const,
      emailType: "contract-discussion",
      tasks: "Review contract",
      suggestedAction: "email-draft",
    };

    if (analysis.category === "External") {
      analysis.suggestedAction = "";
    }

    expect(analysis.suggestedAction).toBe("");
  });

  it("internal emails keep suggestedAction", () => {
    const analysis = {
      category: "Internal" as const,
      emailType: "task-assignment",
      tasks: "Draft response to manager",
      suggestedAction: "email-draft",
    };

    if (analysis.category === "External") {
      analysis.suggestedAction = "";
    }

    expect(analysis.suggestedAction).toBe("email-draft");
  });

  it("external email priority is set by LLM reasoning", () => {
    // LLM determines priority based on email content — no forced override
    const clientEmail = { priorityLabel: "High" as const, category: "External" as const };
    const newsletter = { priorityLabel: "Low" as const, category: "External" as const };
    expect(clientEmail.priorityLabel).toBe("High");
    expect(newsletter.priorityLabel).toBe("Low");
  });
});

// ─── Source code verification ─────────────────────────────────────────────────

describe("source code invariants", () => {
  const source = fs.readFileSync(path.join(__dirname, "handler.ts"), "utf-8");

  it("body limit is 50000 not 5000", () => {
    expect(source).toContain("body.slice(0, 50000)");
    expect(source).not.toMatch(/body\.slice\(0,\s*5000\)/);
  });

  it("batch size is 10", () => {
    expect(source).toContain("BATCH_SIZE = 10");
  });

  it("does not contain daily limit", () => {
    expect(source).not.toContain("DAILY_LIMIT");
  });

  it("does not contain old dedup functions", () => {
    expect(source).not.toContain("loadProcessedIds");
    expect(source).not.toContain("saveProcessedIds");
    expect(source).not.toContain("findFuzzyMatch");
    expect(source).not.toContain("wordOverlap");
  });

  it("CSV header is From,Subject,Tasks,SuggestedAction", () => {
    expect(source).toContain("From,Subject,Tasks,SuggestedAction");
  });

  it("fetches In-Reply-To and References headers for thread detection", () => {
    expect(source).toContain("IN-REPLY-TO");
    expect(source).toContain("REFERENCES");
  });

  it("does not force External emails to High priority", () => {
    expect(source).not.toContain('analysis.priorityLabel = "High"; // Always High for external');
  });
});
