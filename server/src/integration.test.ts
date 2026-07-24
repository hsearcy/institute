// server/src/integration.test.ts — end-to-end over app.fetch with :memory: sqlite.
process.env.DB_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "test-key-no-network";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9"; // refused connection → LLM fails → local fallback (no network dependency)
process.env.TUTOR_MAX_RETRIES = "0"; // no retry backoff — fall back immediately
process.env.TUTOR_TIMEOUT_MS = "300"; // the dead endpoint hangs (WSL2); time out fast instead
const { default: server } = await import("./index.ts");
import { describe, expect, setSystemTime, test } from "bun:test";
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
  test("weekly quest counts five completed daily boards, awards 250 once, and resets Sunday", async () => {
    const profileId = "weekly-quest";
    const topics = TOPICS.filter((t) => t.prereqs.length === 0).slice(0, 4);
    let weeklyAwards = 0;

    try {
      // 2026-07-12 is a Sunday. Finish all five daily quests Sunday–Thursday.
      for (let day = 0; day < 5; day++) {
        setSystemTime(new Date(`2026-07-${12 + day}T12:00:00.000Z`));
        for (let i = 0; i < 25; i++) {
          const topic = topics[i % topics.length];
          const result = await call("POST", "/tutor/attempt", {
            profileId, problemId: `weekly-${day}-${i}`, skill: "add_within_20", topicId: topic.id,
            correct: true, solveMs: 10_000, difficulty: 0.4,
          });
          weeklyAwards += result.reward.questsCompleted
            .filter((q: any) => q.key === "daily_quests_5_days" && q.reward === 250).length;
        }
        const state = await call("GET", `/state?profileId=${profileId}`);
        expect(state.weeklyQuest.progress).toBe(day + 1);
      }

      expect(weeklyAwards).toBe(1);
      let state = await call("GET", `/state?profileId=${profileId}`);
      expect(state.weeklyQuest).toMatchObject({ target: 5, progress: 5, reward: 250, done: true });

      // More answers cannot award the completed weekly quest again.
      const extra = await call("POST", "/tutor/attempt", {
        profileId, problemId: "weekly-extra", skill: "add_within_20", topicId: topics[0].id,
        correct: true, solveMs: 10_000, difficulty: 0.4,
      });
      expect(extra.reward.questsCompleted.some((q: any) => q.key === "daily_quests_5_days")).toBe(false);

      setSystemTime(new Date("2026-07-19T12:00:00.000Z")); // next Sunday
      state = await call("GET", `/state?profileId=${profileId}`);
      expect(state.weeklyQuest).toMatchObject({ progress: 0, done: false });
    } finally {
      setSystemTime();
    }
  });

  test("daily streak quest starts at zero even when the profile streak carries over", async () => {
    const profileId = "quest-carried-streak";
    const answer = async (i: number) => call("POST", "/tutor/attempt", {
      profileId, problemId: `carried-${i}`, skill: "add_within_20",
      correct: true, solveMs: 10_000, difficulty: 0.4,
    });

    try {
      setSystemTime(new Date("2030-01-01T12:00:00.000Z"));
      for (let i = 0; i < 25; i++) await answer(i);
      setSystemTime(new Date("2030-01-02T12:00:00.000Z"));
      await answer(25);

      const state = await call("GET", `/state?profileId=${profileId}`);
      expect(state.streak).toBe(26);
      expect(state.quests.find((q: any) => q.key === "streak_5"))
        .toMatchObject({ progress: 1, done: false });
    } finally {
      setSystemTime();
    }
  });

  test("a wrong first try is penalty-free; the counted miss lives at /reward/miss", async () => {
    const profileId = "quest-daily-streak-reset";
    for (let i = 0; i < 3; i++) {
      await call("POST", "/tutor/attempt", {
        profileId, problemId: `right-${i}`, skill: "add_within_20",
        correct: true, solveMs: 10_000, difficulty: 0.4,
      });
    }
    // A wrong FIRST try no longer touches streak/shields/quests — he has retries left.
    const wrong = await call("POST", "/tutor/attempt", {
      profileId, problemId: "wrong", skill: "add_within_20",
      correct: false, solveMs: 10_000, difficulty: 0.4,
    });
    expect(wrong.reward.streak).toBe(3);
    expect(wrong.reward.shieldUsed).toBe(false);
    let state = await call("GET", `/state?profileId=${profileId}`);
    expect(state.quests.find((q: any) => q.key === "streak_5").progress).toBe(3);

    // The problem moving on IS the miss: streak resets (no shield), quest run resets,
    // and streakLost carries what fell for the best-streak trophy.
    const miss = await call("POST", "/reward/miss", { profileId });
    expect(miss.reward.streak).toBe(0);
    expect(miss.reward.streakLost).toBe(3);
    expect(miss.reward.bestStreak).toBe(3); // the trophy survives
    state = await call("GET", `/state?profileId=${profileId}`);
    expect(state.quests.find((q: any) => q.key === "streak_5").progress).toBe(0);

    await call("POST", "/tutor/attempt", {
      profileId, problemId: "right-again", skill: "add_within_20",
      correct: true, solveMs: 10_000, difficulty: 0.4,
    });
    state = await call("GET", `/state?profileId=${profileId}`);
    expect(state.quests.find((q: any) => q.key === "streak_5").progress).toBe(1);
  });

  test("a shield absorbs the counted miss and keeps the streak", async () => {
    const profileId = "shield-absorbs";
    for (let i = 0; i < 4; i++) {
      await call("POST", "/tutor/attempt", {
        profileId, problemId: `r-${i}`, skill: "add_within_20",
        correct: true, solveMs: 9_000, difficulty: 0.4,
      });
    }
    const { grantShieldForTest } = await import("./index.ts");
    grantShieldForTest(profileId);
    const miss = await call("POST", "/reward/miss", { profileId });
    expect(miss.reward.shieldUsed).toBe(true);
    expect(miss.reward.streak).toBe(4);
    expect(miss.reward.streakLost).toBe(0);
  });

  test("finishing the whole daily board awards one Crazy Coin exactly once", async () => {
    const profileId = "all-dailies-crazy-coin";
    let sawCoinAward = 0;
    for (let i = 0; i < 30; i++) {
      const r = await call("POST", "/tutor/attempt", {
        profileId, problemId: `q-${i}`, skill: "add_within_20",
        topicId: ["mt_e8CZ7E5qW7", "mt_ghF3Vv6taM", "mt_M5PPDJStGm", "mt_LpSuPgL31x", "mt_THl9GLxwoL"][i % 5],
        correct: true, solveMs: 3_000, difficulty: 0.5,
      });
      if (r.reward.allDailiesCrazyCoin) sawCoinAward++;
    }
    expect(sawCoinAward).toBe(1);
    expect((await call("GET", `/mastery?profileId=${profileId}`)).crazyCoins).toBe(1);
    expect((await call("GET", `/state?profileId=${profileId}`)).shields).toBe(0);

    const redeemed = await call("POST", "/shop/redeem-crazy-coin", { profileId });
    expect(redeemed).toEqual({ ok: true, crazyCoins: 0 });
  });

  test("daily quests reward endurance, accuracy, speed, and topic variety", async () => {
    const profileId = "quest-variety";
    let state = await call("GET", `/state?profileId=${profileId}`);
    expect(state.quests.map((q: any) => [q.key, q.target])).toEqual(expect.arrayContaining([
      ["mine_gems", 50],
      ["solve_10", 20],
      ["streak_5", 10],
      ["speed_8", 5],
      ["topic_explorer", 4],
    ]));

    const topics = TOPICS.filter((t) => t.prereqs.length === 0).slice(0, 4);
    // Exactly 20 seconds is not "under 20 seconds."
    await call("POST", "/tutor/attempt", {
      profileId, problemId: "slow", skill: "add_within_20", topicId: topics[0].id,
      correct: true, solveMs: 20_000, difficulty: 0.4,
    });
    for (let i = 0; i < 5; i++) {
      const topic = topics[i % topics.length];
      await call("POST", "/tutor/attempt", {
        profileId, problemId: `fast-${i}`, skill: "add_within_20", topicId: topic.id,
        correct: true, solveMs: 19_999, difficulty: 0.4,
      });
    }

    state = await call("GET", `/state?profileId=${profileId}`);
    const quests = Object.fromEntries(state.quests.map((q: any) => [q.key, q]));
    expect(quests.speed_8).toMatchObject({ progress: 5, done: true });
    expect(quests.topic_explorer).toMatchObject({ progress: 4, done: true });
    expect(quests.solve_10).toMatchObject({ progress: 6, done: false });
    expect(quests.streak_5).toMatchObject({ progress: 6, done: false });
  });

  test("retry solves count for endurance but not speed or topic variety", async () => {
    const profileId = "quest-retry";
    await call("POST", "/reward/retry-solve", { profileId });
    const state = await call("GET", `/state?profileId=${profileId}`);
    const quests = Object.fromEntries(state.quests.map((q: any) => [q.key, q]));
    expect(quests.mine_gems.progress).toBe(1);
    expect(quests.solve_10.progress).toBe(1);
    expect(quests.speed_8.progress).toBe(0);
    expect(quests.topic_explorer.progress).toBe(0);
  });

  test("lifetime gems rise with rewards and never fall when gems are spent", async () => {
    const profileId = "lifetime-gems";
    for (let i = 0; i < 8; i++) {
      await call("POST", "/reward/hoard-bonus", { profileId });
    }

    let state = await call("GET", `/state?profileId=${profileId}`);
    expect(state).toMatchObject({ gems: 80, lifetimeGems: 80 });

    const purchase = await call("POST", "/shop/buy-pad-theme", {
      profileId,
      themeKey: "pad_ocean",
    });
    expect(purchase).toMatchObject({ ok: true, gems: 5 });
    state = await call("GET", `/state?profileId=${profileId}`);
    expect(state).toMatchObject({ gems: 5, lifetimeGems: 80 });

    const answer = await call("POST", "/tutor/attempt", {
      profileId,
      problemId: "lifetime-answer",
      skill: "add_within_20",
      correct: true,
      solveMs: 10_000,
      difficulty: 0.4,
    });
    expect(answer.reward).toMatchObject({ totalGems: 6, lifetimeGems: 81 });
  });

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

  test("crazy coin redemption refuses when no daily reward is available", async () => {
    const r = await call("POST", "/shop/redeem-crazy-coin", { profileId: "kid8" });
    expect(r).toEqual({ ok: false, reason: "no coins", crazyCoins: 0 });
  });

  test("right branch rotates topic after a 4-run (interleaving)", async () => {
    // Build a 4-run on Number Bonds for a fresh profile, then ask for branches.
    const topicId = "mt_e8CZ7E5qW7";
    for (let i = 0; i < 4; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: "kid7", problemId: `p${i}`, skill: "add_within_20",
        topicId, correct: i % 2 === 1, solveMs: 6000, difficulty: 0.5, // mixed, ENDS ON CORRECT so the rescue trigger stays unarmed — this test is about rotation only
      });
    }
    const current = { id: "px", skill: "add_within_20", topicId, topicLabel: "Number Bonds",
      prompt: "3 + ? = 9", spoken: "3 plus what makes 9?", answer: 6, difficulty: 0.5 };
    const b = await call("POST", "/tutor/branches", { profileId: "kid7", current });
    expect(b.right.topicId).not.toBe(topicId);     // rotated away after the run
    expect(b.wrong.topicId).toBe(topicId);          // wrong branch stays put (no rescue armed)
  });

  test("two consecutive misses route the wrong branch down to a prerequisite", async () => {
    // Add & Take to 10 has hard prereqs {Number Bonds, Add & Take to 5}.
    const topicId = "mt__we2TDqnJx";
    const stepDowns = ["mt_e8CZ7E5qW7", "mt_ghF3Vv6taM"];
    // Previous problem on this topic was MISSED → the next miss is the 2nd consecutive.
    await call("POST", "/tutor/attempt", {
      profileId: "kid8", problemId: "p0", skill: "add_within_20",
      topicId, correct: false, solveMs: 9000, difficulty: 0.5,
    });
    const current = { id: "p1", skill: "add_within_20", topicId, topicLabel: "Add & Take to 10",
      prompt: "6 + 3", spoken: "What is 6 plus 3?", answer: 9, difficulty: 0.5 };
    const b = await call("POST", "/tutor/branches", { profileId: "kid8", current });
    expect(stepDowns).toContain(b.wrong.topicId);   // stepped down the graph
    expect(b.wrong.difficulty).toBeLessThanOrEqual(0.5);
    expect(b.right.topicId).toBeDefined();          // right branch unaffected shape
  });

  test("explain falls back to the local hint when the LLM is unreachable, and caches", async () => {
    const problem = { id: "pex1", skill: "add_within_20", topicId: "mt_e8CZ7E5qW7",
      prompt: "6 + ? = 10", spoken: "6 plus what makes 10?", answer: 4,
      difficulty: 0.4, hint: "Count up from 6 until you reach 10." };
    const r1 = await call("POST", "/tutor/explain", { profileId: "kid9", problem });
    expect(r1.text).toBe("Count up from 6 until you reach 10.");
    const r2 = await call("POST", "/tutor/explain", { profileId: "kid9", problem });
    expect(r2.text).toBe(r1.text); // cached / stable
  });

  test("leaksAnswer catches standalone answer tokens only", async () => {
    const { leaksAnswer } = await import("./index.ts");
    expect(leaksAnswer("so six and four make ten", 4)).toBe(false);
    expect(leaksAnswer("the answer is 4", 4)).toBe(true);
    expect(leaksAnswer("count 14 gems", 4)).toBe(false); // 4 inside 14 is fine
    expect(leaksAnswer("what do 6 and how many make 10?", 4)).toBe(false);
  });
});

describe("pad theme shop", () => {
  const P = "pad-shopper";
  test("buy deducts gems, records ownership, auto-equips; insufficient rejected", async () => {
    // fund the profile with correct answers
    for (let i = 0; i < 5; i++) {
      await call("POST", "/tutor/attempt", {
        profileId: P, problemId: `f-${i}`, skill: "add_within_20",
        topicId: "mt_e8CZ7E5qW7", correct: true, solveMs: 3000, difficulty: 0.5,
      });
    }
    const broke = await call("POST", "/shop/buy-pad-theme", { profileId: P, themeKey: "pad_rainbow" });
    expect(broke.ok).toBe(false); // 650 > a handful of gems
    const { grantShieldForTest } = await import("./index.ts"); // reuse pattern: fund via attempts instead
    void grantShieldForTest;
    // cheat gems up via hoard bonuses (server-authoritative credit endpoint)
    for (let i = 0; i < 8; i++) await call("POST", "/reward/hoard-bonus", { profileId: P });
    const buy = await call("POST", "/shop/buy-pad-theme", { profileId: P, themeKey: "pad_ocean" });
    expect(buy.ok).toBe(true);
    expect(buy.equippedPadTheme).toBe("pad_ocean");
    const shop = await call("GET", `/shop?profileId=${P}`);
    expect(shop.equippedPadTheme).toBe("pad_ocean");
    expect(shop.padThemes.find((t: any) => t.key === "pad_ocean").owned).toBe(true);
    // double-buy rejected
    expect((await call("POST", "/shop/buy-pad-theme", { profileId: P, themeKey: "pad_ocean" })).ok).toBe(false);
  });
  test("equip: classic always; unowned rejected; pad keys can't equip as pickaxes", async () => {
    expect((await call("POST", "/shop/equip-pad-theme", { profileId: P, themeKey: "pad_classic" })).ok).toBe(true);
    expect((await call("POST", "/shop/equip-pad-theme", { profileId: P, themeKey: "pad_galaxy" })).ok).toBe(false);
    expect((await call("POST", "/shop/equip", { profileId: P, itemKey: "pad_ocean" })).ok).toBe(false);
  });
});

describe("gem style shop", () => {
  const P = "gem-style-shopper";

  test("buy deducts gems, records ownership, auto-equips, and persists in state", async () => {
    for (let i = 0; i < 10; i++) {
      await call("POST", "/reward/hoard-bonus", { profileId: P });
    }

    const buy = await call("POST", "/shop/buy-gem-style", {
      profileId: P,
      styleKey: "gem_emerald",
    });
    expect(buy).toMatchObject({
      ok: true,
      gems: 10,
      equippedGemStyle: "gem_emerald",
      item: { key: "gem_emerald", name: "Mega Emerald", price: 90 },
    });

    const shop = await call("GET", `/shop?profileId=${P}`);
    expect(shop.equippedGemStyle).toBe("gem_emerald");
    expect(shop.gemStyles.find((style: any) => style.key === "gem_emerald"))
      .toMatchObject({ owned: true, equipped: true });

    const state = await call("GET", `/state?profileId=${P}`);
    expect(state.equippedGemStyle).toBe("gem_emerald");
    expect((await call("POST", "/shop/buy-gem-style", {
      profileId: P,
      styleKey: "gem_emerald",
    })).ok).toBe(false);
  });

  test("classic is always equipable while unowned and cross-category keys are rejected", async () => {
    expect((await call("POST", "/shop/equip-gem-style", {
      profileId: P,
      styleKey: "gem_classic",
    }))).toMatchObject({ ok: true, equippedGemStyle: "gem_classic" });

    expect((await call("POST", "/shop/equip-gem-style", {
      profileId: P,
      styleKey: "gem_dragonheart",
    })).ok).toBe(false);

    expect((await call("POST", "/shop/equip", {
      profileId: P,
      itemKey: "gem_emerald",
    }))).toMatchObject({ ok: false, reason: "not a pickaxe" });

    expect((await call("POST", "/shop/equip-pad-theme", {
      profileId: P,
      themeKey: "gem_emerald",
    })).ok).toBe(false);
  });

  test("unaffordable and unknown styles are rejected without changing balance", async () => {
    const profileId = "gem-style-broke";
    const expensive = await call("POST", "/shop/buy-gem-style", {
      profileId,
      styleKey: "gem_dragonheart",
    });
    expect(expensive).toMatchObject({ ok: false, reason: "not enough gems", gems: 0 });

    const unknown = await call("POST", "/shop/buy-gem-style", {
      profileId,
      styleKey: "gem_unknown",
    });
    expect(unknown).toMatchObject({ ok: false, reason: "unavailable", gems: 0 });
  });
});

describe("the 'not sure yet' escape hatch", () => {
  test("a skip costs nothing: streak, shields, and gems all untouched", async () => {
    const profileId = "skipper";
    for (let i = 0; i < 3; i++) {
      await call("POST", "/tutor/attempt", {
        profileId, problemId: `ok-${i}`, skill: "add_within_20",
        topicId: "mt_e8CZ7E5qW7", correct: true, solveMs: 4000, difficulty: 0.5,
      });
    }
    const before = await call("GET", `/state?profileId=${profileId}`);
    const skip = await call("POST", "/tutor/skip", {
      profileId, problemId: "skipped-1", skill: "add_within_20",
      topicId: "mt_e8CZ7E5qW7", difficulty: 0.5,
    });
    expect(skip.ok).toBe(true);
    const after = await call("GET", `/state?profileId=${profileId}`);
    expect(after.streak).toBe(before.streak);     // the whole point: no streak loss
    expect(after.shields).toBe(before.shields);   // no shield burned either
    expect(after.gems).toBe(before.gems);         // and no gem earned for skipping
  });

  test("a skip is honest learning data: it counts as a not-correct attempt", async () => {
    const profileId = "skip-data";
    await call("POST", "/tutor/skip", {
      profileId, problemId: "s-1", skill: "add_within_20",
      topicId: "mt_e8CZ7E5qW7", difficulty: 0.5,
    });
    const m = await call("GET", `/mastery?profileId=${profileId}`);
    const row = m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7");
    expect(row.attempts).toBe(1);
    expect(row.correct).toBe(0);
    expect(row.skips).toBe(1);   // surfaced for the parent dashboard
  });

  test("skipping arms the prereq step-down, exactly like a miss", async () => {
    const profileId = "skip-rescue";
    const topicId = "mt__we2TDqnJx"; // Add & Take to 10: prereqs Number Bonds + Add & Take to 5
    await call("POST", "/tutor/skip", { profileId, problemId: "s0", skill: "add_within_20", topicId, difficulty: 0.5 });
    const current = { id: "p1", skill: "add_within_20", topicId, topicLabel: "Add & Take to 10",
      prompt: "6 + 3", spoken: "What is 6 plus 3?", answer: 9, difficulty: 0.5 };
    const b = await call("POST", "/tutor/branches", { profileId, current });
    expect(["mt_e8CZ7E5qW7", "mt_ghF3Vv6taM"]).toContain(b.wrong.topicId);
  });

  test("a skip for an already-answered problem is ignored (no double-count)", async () => {
    const profileId = "skip-dupe";
    await call("POST", "/tutor/attempt", {
      profileId, problemId: "dupe-1", skill: "add_within_20",
      topicId: "mt_e8CZ7E5qW7", correct: false, solveMs: 8000, difficulty: 0.5,
    });
    await call("POST", "/tutor/skip", {
      profileId, problemId: "dupe-1", skill: "add_within_20",
      topicId: "mt_e8CZ7E5qW7", difficulty: 0.5,
    });
    const m = await call("GET", `/mastery?profileId=${profileId}`);
    expect(m.topics.find((t: any) => t.id === "mt_e8CZ7E5qW7").attempts).toBe(1);
  });

  test("walkthrough falls back to the answer + hint when the LLM is unreachable", async () => {
    const problem = { id: "wt-1", skill: "add_within_20", topicId: "mt_e8CZ7E5qW7",
      prompt: "6 + ? = 10", spoken: "6 plus what makes 10?", answer: 4,
      difficulty: 0.4, hint: "Count up from 6 until you reach 10." };
    const r = await call("POST", "/tutor/walkthrough", { profileId: "wt", problem });
    expect(r.text).toContain("4");                       // the answer IS the point here
    expect(r.text).toContain("Count up from 6");
  });
});
