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
    const s1 = applyOutcome(s0, outcome({ correct: true }));
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(1);
  });

  test("first wrong also moves unstarted → learning (not penalized)", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: false }));
    expect(s1.state).toBe("learning");
    expect(s1.attempts).toBe(1);
    expect(s1.correct).toBe(0);
  });

  test("learning → practicing on a correct attempt at low difficulty", () => {
    const s0 = initialSkillState("p1", "add_within_5");
    const s1 = applyOutcome(s0, outcome({ correct: true, difficulty: 0.15 }));
    const s2 = applyOutcome(s1, outcome({ correct: true, difficulty: 0.2 }));
    expect(s2.state).toBe("practicing");
  });

  test("practicing → mastered after 4 of last 5 correct, no hints, in upper band", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Move to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    // 5 correct attempts in upper band
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.28, hinted: false }));
    }
    expect(s.state).toBe("mastered");
  });

  test("hinted attempts do not count toward mastery promotion", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    for (let i = 0; i < 5; i++) {
      s = applyOutcome(s, outcome({ correct: true, hinted: true, difficulty: 0.28 }));
    }
    expect(s.state).toBe("practicing");
  });

  test("2 unhinted wrongs in a row demote any state to learning", () => {
    let s = initialSkillState("p1", "add_within_5");
    // Get to practicing
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }));
    s = applyOutcome(s, outcome({ correct: false, difficulty: 0.3 }));
    expect(s.state).toBe("learning");
  });

  test("scaffolded wrongs do NOT trigger demotion (per spec)", () => {
    let s = initialSkillState("p1", "add_within_5");
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    s = applyOutcome(s, outcome({ correct: true, difficulty: 0.2 }));
    expect(s.state).toBe("practicing");
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }));
    s = applyOutcome(s, outcome({ correct: false, scaffolded: true, difficulty: 0.3 }));
    expect(s.state).toBe("practicing");
  });

  test("recentWindow is bounded to the last 8 attempts", () => {
    let s = initialSkillState("p1", "counting_1_5");
    for (let i = 0; i < 12; i++) {
      s = applyOutcome(s, outcome({ correct: true, difficulty: 0.1 }));
    }
    expect(s.recentWindow.length).toBe(8);
    expect(s.attempts).toBe(12);
  });
});
