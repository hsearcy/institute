import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "./inMemoryDb";
import { appendAttempt, loadRecentAttempts } from "../../src/persistence/attemptRepo";
import type { AttemptOutcome } from "@institute/skill-engine";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

const sample = (overrides: Partial<AttemptOutcome> = {}): AttemptOutcome => ({
  skillId: "skip_count_2",
  correct: true,
  hinted: false,
  scaffolded: false,
  difficulty: 0.4,
  occurredAt: new Date("2026-04-26T12:00:00Z"),
  ...overrides,
});

describe("attemptRepo", () => {
  test("loadRecentAttempts returns [] when empty", () => {
    expect(loadRecentAttempts(db, "sam", 10)).toEqual([]);
  });

  test("append + load round-trip", () => {
    appendAttempt(db, "sam", sample());
    const rows = loadRecentAttempts(db, "sam", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correct).toBe(true);
    expect(rows[0]!.occurredAt).toBeInstanceOf(Date);
  });

  test("loadRecentAttempts is most-recent first and respects limit", () => {
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:00:00Z"), correct: true }));
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:01:00Z"), correct: false }));
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:02:00Z"), correct: true }));
    const rows = loadRecentAttempts(db, "sam", 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.occurredAt.toISOString()).toBe("2026-04-26T12:02:00.000Z");
    expect(rows[1]!.occurredAt.toISOString()).toBe("2026-04-26T12:01:00.000Z");
  });

  test("scopes to profile", () => {
    appendAttempt(db, "sam",  sample());
    appendAttempt(db, "alex", sample());
    expect(loadRecentAttempts(db, "sam",  10)).toHaveLength(1);
    expect(loadRecentAttempts(db, "alex", 10)).toHaveLength(1);
  });
});
