import { test, expect, describe } from "bun:test";
import { applyOutcome, initialSkillState } from "../src/mastery.ts";
import type { AttemptOutcome } from "../src/types.ts";

const at = (iso: string) => new Date(iso);

const outcome = (overrides: Partial<AttemptOutcome>): AttemptOutcome => ({
  correct: true,
  hinted: false,
  scaffolded: false,
  difficulty: 0.3,
  occurredAt: at("2026-04-25T10:00:00Z"),
  ...overrides,
});

describe("applyOutcome", () => {
  test("first correct moves unstarted → learning", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    expect(s0.state).toBe("unstarted");
    const s1 = applyOutcome(s0, outcome({ correct: true }), [0.15, 0.3] as const);
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(1);
  });

  test("first wrong also moves unstarted → learning (not penalized)", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: false }), [0.15, 0.3] as const);
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(0);
  });

  test("learning → practicing on a correct attempt at low difficulty", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: true, difficulty: 0.15 }), [0.15, 0.3] as const);
    const s2 = applyOutcome(s1, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    expect(s2.state).toBe("practicing");
  });

  test("practicing → mastered after 4 of last 5 correct, no hints, in upper band", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Move to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
    // 5 correct attempts in upper band
    // add_within_5 band is [0.15, 0.3] — upper threshold is 0.15 + 0.66 * 0.15 = 0.249
    // so 0.28 is comfortably above the threshold
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.28, hinted: false }), [0.15, 0.3] as const);
    }
    expect(s.state).toBe("mastered");
  });

  test("hinted attempts do not count toward mastery promotion", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, hinted: true, difficulty: 0.28 }), [0.15, 0.3] as const);
    }
    expect(s.state).toBe("practicing");
  });

  test("2 unhinted wrongs in a row demote any state to learning", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Get to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }), [0.15, 0.3] as const);
    expect(s.state).toBe("learning");
  });

  test("scaffolded wrongs do NOT trigger demotion (per spec)", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
  });

  test("hinted wrongs do NOT trigger demotion", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, hinted: true, difficulty: 0.3 }), [0.15, 0.3] as const);
    s = applyOutcome(s, outcome({ correct: false, hinted: true, difficulty: 0.3 }), [0.15, 0.3] as const);
    expect(s.state).toBe("practicing");
  });

  test("recentWindow is bounded to the last 8 attempts", () => {
    let s = initialSkillState("p1", "counting_1_5");
    for (let i = 0; i < 12; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.1 }), [0.0, 0.15] as const);
    }
    expect(s.recentWindow.length).toBe(8);
    expect(s.attempts).toBe(12);
  });

  test("a low-band skill (counting_1_5) can be mastered with sustained correct answers", () => {
    let s = initialSkillState("p1", "counting_1_5");
    // counting_1_5 band is [0.0, 0.15] — upper threshold is 0.0 + 0.66 * 0.15 = 0.099
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.05 }), [0.0, 0.15] as const);
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.05 }), [0.0, 0.15] as const);
    expect(s.state).toBe("practicing");
    // Now 5 more correct attempts in the upper band (>= 0.099)
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.13 }), [0.0, 0.15] as const);
    }
    expect(s.state).toBe("mastered");
  });
});
