// Deterministic-enough local problem generator. Used to bootstrap the very first
// problem instantly (no LLM wait at startup) and as the always-available fallback
// if the LLM is slow or errors — so the game loop is never blocked.
import type { ProblemVisual, Skill } from "@institute/shared";

export type ProblemDraft = {
  skill: Skill;
  prompt: string;
  spoken: string;
  answer: number;
  difficulty: number;
  hint?: string;
  visual?: ProblemVisual;
};

const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Kid-friendly make-a-ten / count strategy hint for an addition. */
export function addHint(a: number, b: number): string {
  const sum = a + b;
  if (sum <= 10) return `Count on from ${Math.max(a, b)}: add ${Math.min(a, b)} more, one at a time.`;
  const big = Math.max(a, b), small = Math.min(a, b);
  const need = 10 - big, left = small - need;
  return `Make a ten! ${big} plus ${need} makes 10, then ${left} more makes ${sum}.`;
}
export function subHint(a: number, b: number): string {
  return `Start at ${a} and count back ${b}: ${a}, ${a - 1}… until you've taken away ${b}.`;
}

export function localProblem(skill: Skill, difficulty: number): ProblemDraft {
  const d = Math.max(0, Math.min(1, difficulty));
  switch (skill) {
    case "add_within_20": {
      // Both addends single-digit; higher difficulty crosses ten (make-a-ten).
      let a: number, b: number;
      if (d < 0.4) {                       // no carry: sum ≤ 9
        a = ri(1, 7); b = ri(1, 9 - a);
      } else if (d < 0.7) {                // mixed, sums up to ~14
        a = ri(2, 9); b = ri(2, Math.min(9, 14 - a));
      } else {                             // crosses ten: sums 11–18
        a = ri(4, 9); b = ri(Math.max(3, 11 - a), 9);
      }
      return { skill, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b, difficulty: d, hint: addHint(a, b) };
    }
    case "subtraction": {
      const maxA = d < 0.4 ? 10 : d < 0.7 ? 15 : 20;
      const a = ri(2, maxA);
      const b = ri(1, a);
      return { skill, prompt: `${a} − ${b}`, spoken: `What is ${a} minus ${b}?`, answer: a - b, difficulty: d, hint: subHint(a, b) };
    }
    case "skip_counting": {
      const step = d < 0.4 ? 2 : d < 0.7 ? 5 : 10;
      const start = step;
      const seq = [start, start + step, start + 2 * step];
      const next = start + 3 * step;
      return {
        skill,
        prompt: `${seq.join(", ")}, ?`,
        spoken: `Keep counting by ${step}s. ${seq.join(", ")}... what comes next?`,
        answer: next,
        difficulty: d,
        hint: `Add ${step} to the last number: ${seq[2]} plus ${step}.`,
      };
    }
    case "place_value": {
      const tens = ri(1, d < 0.5 ? 3 : 5);
      const ones = ri(0, 9);
      const num = tens * 10 + ones;
      if (d < 0.5) {
        return { skill, prompt: `Tens in ${num}?`, spoken: `How many tens are in ${num}?`, answer: tens, difficulty: d, hint: `Each ten is a group of 10. Count the groups of 10 in ${num}.` };
      }
      return {
        skill,
        prompt: `${tens} tens ${ones} ones`,
        spoken: `${tens} tens and ${ones} ones make what number?`,
        answer: num,
        difficulty: d,
        hint: `${tens} tens is ${tens * 10}, then add ${ones} more.`,
      };
    }
    case "multiplication": {
      const cap = d < 0.5 ? 5 : 9;
      const a = ri(2, cap);
      const b = ri(2, cap);
      return { skill, prompt: `${a} × ${b}`, spoken: `What is ${a} times ${b}?`, answer: a * b, difficulty: d, hint: `${a} groups of ${b}. Skip-count by ${b}, ${a} times.` };
    }
    case "division": {
      const b = ri(2, 5);
      const q = ri(2, 5);
      const a = b * q;
      return { skill, prompt: `${a} ÷ ${b}`, spoken: `What is ${a} divided by ${b}?`, answer: q, difficulty: d, hint: `How many ${b}s fit into ${a}? Count by ${b}s up to ${a}.` };
    }
  }
}

export type SkillStat = { skill: Skill; attempts: number; correct: number; avgDifficulty: number };

/** Pick a sensible first problem from stored stats (instant, no LLM). MVP focuses
 *  on addition-to-20 + subtraction; nudges difficulty by recent accuracy. */
export function pickStart(stats: SkillStat[]): ProblemDraft {
  const focus: Skill[] = ["add_within_20", "subtraction"];
  const byId = new Map(stats.map((s) => [s.skill, s]));
  // Prefer the focus skill with the lowest accuracy (most in need of practice).
  let chosen: Skill = "add_within_20";
  let worst = 2;
  for (const s of focus) {
    const st = byId.get(s);
    const acc = st && st.attempts > 0 ? st.correct / st.attempts : 0.6; // unseen → mid
    if (acc < worst) { worst = acc; chosen = s; }
  }
  const st = byId.get(chosen);
  const acc = st && st.attempts >= 3 ? st.correct / st.attempts : 0.6;
  // Higher accuracy → harder; shaky → easier. Anchor near the kid's recent level.
  const base = st ? st.avgDifficulty : 0.4;
  const difficulty = Math.max(0.2, Math.min(0.95, base + (acc - 0.75) * 0.5));
  return localProblem(chosen, difficulty);
}
