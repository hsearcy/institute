// server/src/topicgen.ts — synthesize a problem for a curated topic. The GenSpec is
// the topic's numeric envelope; difficulty (0..1) scales *within* it.
import type { Topic } from "@institute/shared";
import { addHint, subHint, type ProblemDraft } from "./generate.ts";

const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const lerp = (lo: number, hi: number, d: number) => Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, d)));

export type TopicProblemDraft = ProblemDraft & { topicId: string; topicLabel: string };

export function problemForTopic(topic: Topic, difficulty: number): TopicProblemDraft {
  const d = Math.max(0, Math.min(1, difficulty));
  const g = topic.gen;
  const base = { skill: topic.legacySkill as ProblemDraft["skill"], difficulty: d, topicId: topic.id, topicLabel: topic.kidLabel };

  switch (g.kind) {
    case "add_sub": {
      const cap = Math.max(4, lerp(Math.ceil(g.max / 2), g.max, d));
      if (Math.random() < 0.5) {
        // addition: sum ≤ cap; when carry allowed and d high, prefer crossing ten
        let a: number, b: number;
        if (g.carry && cap > 10 && d > 0.6) { a = ri(4, 9); b = ri(Math.max(2, 11 - a), Math.min(9, cap - a)); }
        else { a = ri(1, cap - 1); b = ri(1, cap - a); }
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b, hint: addHint(a, b) };
      }
      const a = ri(2, cap), b = ri(1, a);
      return { ...base, prompt: `${a} − ${b}`, spoken: `What is ${a} minus ${b}?`, answer: a - b, hint: subHint(a, b) };
    }
    case "missing_addend": {
      const total = ri(Math.max(4, lerp(4, g.totalMax, d) - 3), lerp(5, g.totalMax, d));
      const a = ri(1, total - 1);
      return { ...base, prompt: `${a} + ? = ${total}`, spoken: `${a} plus what makes ${total}?`, answer: total - a,
        hint: `Count up from ${a} until you reach ${total}. How many hops?` };
    }
    case "add3": {
      const cap = lerp(9, g.sumMax, d);
      const a = ri(1, Math.max(1, cap - 4)), b = ri(1, Math.max(1, cap - a - 2)), c = ri(1, Math.max(1, cap - a - b));
      return { ...base, prompt: `${a} + ${b} + ${c}`, spoken: `What is ${a} plus ${b} plus ${c}?`, answer: a + b + c,
        hint: `Add two first: ${a} plus ${b} is ${a + b}. Then add ${c} more.` };
    }
    case "next_number": {
      const n = ri(lerp(5, 40, d), lerp(20, g.max - 1, d));
      return { ...base, prompt: `${n}, then?`, spoken: `What number comes right after ${n}?`, answer: n + 1,
        hint: `Count on: ${n}, and one more.` };
    }
    case "skip": {
      const step = g.steps[ri(0, g.steps.length - 1)];
      const start = step * ri(1, lerp(1, 5, d));
      const seq = [start, start + step, start + 2 * step];
      return { ...base, prompt: `${seq.join(", ")}, ?`, spoken: `Keep counting by ${step}s. ${seq.join(", ")}… what comes next?`,
        answer: start + 3 * step, hint: `Add ${step} to the last number: ${seq[2]} plus ${step}.` };
    }
    case "ten_more_less": {
      const n = ri(11, lerp(40, g.max, d));
      const more = Math.random() < 0.5;
      return { ...base, prompt: `${n} ${more ? "+" : "−"} 10`, spoken: `What is ten ${more ? "more" : "less"} than ${n}?`,
        answer: more ? n + 10 : n - 10, hint: `Only the tens digit changes: ${Math.floor(n / 10)} tens goes ${more ? "up" : "down"} by one.` };
    }
    case "compose_tens": {
      const tens = ri(1, lerp(3, g.tensMax, d)), ones = ri(0, 9);
      return { ...base, prompt: `${tens} tens ${ones} ones`, spoken: `${tens} tens and ${ones} ones make what number?`,
        answer: tens * 10 + ones, hint: `${tens} tens is ${tens * 10}, then add ${ones} more.` };
    }
    case "add_sub_tens": {
      const a = 10 * ri(1, lerp(3, 6, d));
      if (Math.random() < 0.5) {
        const b = 10 * ri(1, Math.min(9, Math.floor((90 - a) / 10)));
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
          hint: `Think in tens: ${a / 10} tens plus ${b / 10} tens.` };
      }
      const b = 10 * ri(1, a / 10);
      return { ...base, prompt: `${a} − ${b}`, spoken: `What is ${a} minus ${b}?`, answer: a - b,
        hint: `Think in tens: ${a / 10} tens take away ${b / 10} tens.` };
    }
    case "mul": case "mul_div": {
      const t = g.tables[ri(0, g.tables.length - 1)];
      const k = ri(2, lerp(3, 9, d));
      if (g.kind === "mul_div" && Math.random() < 0.4) {
        return { ...base, prompt: `${t * k} ÷ ${t}`, spoken: `What is ${t * k} divided by ${t}?`, answer: k,
          hint: `How many ${t}s make ${t * k}? Count by ${t}s.` };
      }
      return { ...base, prompt: `${t} × ${k}`, spoken: `What is ${t} times ${k}?`, answer: t * k,
        hint: `${k} groups of ${t}. Skip-count by ${t}, ${k} times.` };
    }
    case "div": {
      const b = g.divisors[ri(0, g.divisors.length - 1)];
      const q = ri(2, Math.max(2, lerp(2, g.quotientMax, d)));
      return { ...base, prompt: `${b * q} ÷ ${b}`, spoken: `If you share ${b * q} gems between ${b} friends, how many does each get?`,
        answer: q, hint: `Deal them out one at a time to ${b} friends, or count by ${b}s up to ${b * q}.` };
    }
  }
}
