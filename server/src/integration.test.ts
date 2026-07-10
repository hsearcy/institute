// server/src/integration.test.ts — end-to-end over app.fetch with :memory: sqlite.
process.env.DB_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "test-key-no-network";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9"; // refused connection → LLM fails → local fallback (no network dependency)
process.env.TUTOR_MAX_RETRIES = "0"; // no retry backoff — fall back immediately
process.env.TUTOR_TIMEOUT_MS = "300"; // the dead endpoint hangs (WSL2); time out fast instead
const { default: server } = await import("./index.ts");
import { describe, expect, test } from "bun:test";
import { TOPICS } from "@institute/shared";

const call = async (method: string, path: string, body?: unknown) => {
  const res = await server.fetch(
    new Request(`http://x${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res.json() as Promise<any>;
};

describe("topic-graph tutor flow", () => {
  test("first problem comes from a root topic and carries topicId + label", async () => {
    const p = await call("POST", "/tutor/first", { profileId: "kid1" });
    const topic = TOPICS.find((t) => t.id === p.topicId);
    expect(topic).toBeDefined();
    expect(topic!.prereqs).toEqual([]); // nothing mastered yet ⇒ must be a root
    expect(p.topicLabel).toBe(topic!.kidLabel);
    expect(typeof p.answer).toBe("number");
  });

  test("mastering ALL prereqs of a topic unlocks it", async () => {
    // Deterministic: Add & Take to 10 (mt__we2TDqnJx) requires BOTH roots
    // Add & Take to 5 (mt_ghF3Vv6taM) and Number Bonds (mt_e8CZ7E5qW7).
    const target = TOPICS.find((t) => t.id === "mt__we2TDqnJx")!;
    expect([...target.prereqs].sort()).toEqual(["mt_e8CZ7E5qW7", "mt_ghF3Vv6taM"]);

    const master = async (topicId: string) => {
      for (let i = 0; i < 8; i++) {
        await call("POST", "/tutor/attempt", {
          profileId: "kid2", problemId: `${topicId}-p${i}`, skill: "add_within_20",
          topicId, correct: true, solveMs: 2500, difficulty: 0.5,
        });
      }
    };

    await master("mt_ghF3Vv6taM");
    let m = await call("GET", "/mastery?profileId=kid2");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("mastered");
    // Only ONE of the two prereqs is mastered — target must stay locked.
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(false);

    await master("mt_e8CZ7E5qW7");
    m = await call("GET", "/mastery?profileId=kid2");
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(true);
    // …and /tutor/first now serves from the frontier, never a mastered root.
    const next = await call("POST", "/tutor/first", { profileId: "kid2" });
    expect(["mt_ghF3Vv6taM", "mt_e8CZ7E5qW7"]).not.toContain(next.topicId);
  });

  test("fluency topics stay practicing when solves are slow", async () => {
    // use a fluency root directly: Add & Take to 5 (fluentMs 7000)
    for (let i = 0; i < 10; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: "kid3", problemId: `p${i}`, skill: "add_within_20",
        topicId: "mt_ghF3Vv6taM", correct: true, solveMs: 15000, difficulty: 0.5,
      });
    }
    const m = await call("GET", "/mastery?profileId=kid3");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("practicing");
  });

  test("branches fall back locally and stay on the current topic", async () => {
    const first = await call("POST", "/tutor/first", { profileId: "kid4" });
    const b = await call("POST", "/tutor/branches", { profileId: "kid4", current: first });
    expect(b.right.topicId).toBeDefined();
    expect(b.wrong.topicId).toBe(first.topicId); // wrong branch reinforces same topic
    expect(b.right.difficulty).toBeGreaterThan(b.wrong.difficulty);
  });

  test("legacy mastery rows migrate to topic grants", async () => {
    // The migration function is exported for testability.
    const { grantLegacyMastery } = await import("./index.ts");
    grantLegacyMastery("kid5", ["add_within_20"]);
    const m = await call("GET", "/mastery?profileId=kid5");
    expect(m.topics.find((t: any) => t.id === "mt_ghF3Vv6taM").state).toBe("mastered");
    expect(m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7").state).toBe("mastered");
    // ⇒ Add & Take to 10 unlocked
    expect(m.topics.find((t: any) => t.id === "mt__we2TDqnJx").unlocked).toBe(true);
  });

  test("mastering a topic schedules a review ~1 day out", async () => {
    for (let i = 0; i < 8; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: "kid6", problemId: `p${i}`, skill: "add_within_20",
        topicId: "mt_e8CZ7E5qW7", correct: true, solveMs: 2500, difficulty: 0.5,
      });
    }
    const m = await call("GET", "/mastery?profileId=kid6");
    const row = m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7");
    expect(row.state).toBe("mastered");
    expect(row.reviewIntervalDays).toBe(1);
    const day = 24 * 60 * 60 * 1000;
    expect(row.reviewDueAt).toBeGreaterThan(Date.now() + day - 60_000);
    expect(row.reviewDueAt).toBeLessThan(Date.now() + day + 60_000);
  });

  test("crazy coin: buy debits 200 gems, parent redeem decrements, both guard", async () => {
    // Broke: buy must refuse.
    let r = await call("POST", "/shop/buy-crazy-coin", { profileId: "kid8" });
    expect(r).toEqual({ ok: false, reason: "not enough gems", gems: 0, crazyCoins: 0 });
    // No coins: redeem must refuse.
    r = await call("POST", "/shop/redeem-crazy-coin", { profileId: "kid8" });
    expect(r).toEqual({ ok: false, reason: "no coins", crazyCoins: 0 });

    // Credit 250 gems via hoard bonuses (10 each), then buy.
    for (let i = 0; i < 25; i++) await call("POST", "/reward/hoard-bonus", { profileId: "kid8" });
    r = await call("POST", "/shop/buy-crazy-coin", { profileId: "kid8" });
    expect(r).toEqual({ ok: true, gems: 50, crazyCoins: 1 });

    // The count flows to the kid's shop AND the parent dashboard.
    const shop = await call("GET", "/shop?profileId=kid8");
    expect(shop.crazyCoins).toBe(1);
    const m = await call("GET", "/mastery?profileId=kid8");
    expect(m.crazyCoins).toBe(1);

    // Parent redeems it — gems untouched (already spent at purchase).
    r = await call("POST", "/shop/redeem-crazy-coin", { profileId: "kid8" });
    expect(r).toEqual({ ok: true, crazyCoins: 0 });
    const state = await call("GET", "/state?profileId=kid8");
    expect(state.gems).toBe(50);
  });

  test("right branch rotates topic after a 4-run (interleaving)", async () => {
    // Build a 4-run on Number Bonds for a fresh profile, then ask for branches.
    const topicId = "mt_e8CZ7E5qW7";
    for (let i = 0; i < 4; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: "kid7", problemId: `p${i}`, skill: "add_within_20",
        topicId, correct: i % 2 === 0, solveMs: 6000, difficulty: 0.5, // mixed → not mastered
      });
    }
    const current = { id: "px", skill: "add_within_20", topicId, topicLabel: "Number Bonds",
      prompt: "3 + ? = 9", spoken: "3 plus what makes 9?", answer: 6, difficulty: 0.5 };
    const b = await call("POST", "/tutor/branches", { profileId: "kid7", current });
    expect(b.right.topicId).not.toBe(topicId);     // rotated away after the run
    expect(b.wrong.topicId).toBe(topicId);          // wrong branch never switches
  });
});
