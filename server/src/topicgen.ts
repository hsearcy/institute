// server/src/topicgen.ts — synthesize a problem for a curated topic. The GenSpec is
// the topic's numeric envelope; difficulty (0..1) scales *within* it.
import type { Topic } from "@institute/shared";
import { addHint, subHint, type ProblemDraft } from "./generate.ts";
import { costume } from "./costume.ts";

const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** "Add a ten first, then adjust" for a missing addend `a + ? = total`. Builds
 *  place-value sense and skips the second hard sum the count-to-ten method ends
 *  in. Falls back to counting on when the answer doesn't cross ten. */
function missingAddendHint(a: number, total: number): string {
  const ans = total - a;
  if (ans < 10) return `Count up from ${a} to ${total}. How many more?`;
  if (ans === 10) return `Add a ten! ${a} plus 10 lands right on ${total}.`;
  return `Add a ten first: ${a} plus 10 is ${a + 10}. How many more to reach ${total}?`;
}

// ---- spoken-number helpers ---------------------------------------------------
// ElevenLabs garbles bare digit runs ("8, 10, 12" comes out mangled), so spoken
// forms use WORDS for number sequences while the on-screen prompt keeps digits.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export function numberWords(n: number): string {
  if (n < 0 || n > 999 || !Number.isInteger(n)) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberWords(n % 100) : "");
}
/** "counting by twos/fifties/hundreds" — the plural step name, spoken. */
const STEP_WORDS: Record<number, string> = {
  2: "twos", 3: "threes", 4: "fours", 5: "fives", 8: "eights",
  10: "tens", 25: "twenty-fives", 50: "fifties", 100: "hundreds",
};
const stepWords = (n: number): string => STEP_WORDS[n] ?? `${numberWords(n)}s`;
const lerp = (lo: number, hi: number, d: number) => Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, d)));

export type TopicProblemDraft = ProblemDraft & { topicId: string; topicLabel: string };

// ---- gem-shop costume (serve sites only) -------------------------------------
// The dice roll lives HERE, not in problemForTopic: that function is also called
// to render example prompts for the LLM and inside uniqueness retry loops, which
// must not consume randomness or the no-repeat state.
const COSTUME_RATE = 0.4;
let lastServedCostumed = false;

/** Maybe dress an EXISTING problem in gem-shop clothes (spoken only — prompt,
 *  answer, and hint untouched), never twice in a row across served problems. */
export function maybeCostume<T extends ProblemDraft>(p: T, topic: Topic): T {
  if (lastServedCostumed || Math.random() >= COSTUME_RATE) {
    lastServedCostumed = false;
    return p;
  }
  const c = costume(p, topic.gen.kind);
  if (!c) { lastServedCostumed = false; return p; }
  lastServedCostumed = true;
  return { ...p, spoken: c.spoken };
}

/** Generate a problem for serving to the kid, possibly costumed. */
export function serveProblem(topic: Topic, difficulty: number): TopicProblemDraft {
  return maybeCostume(problemForTopic(topic, difficulty), topic);
}

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
        hint: missingAddendHint(a, total) };
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
      const back = !!g.back && Math.random() < 0.5;
      // offset ⇒ start anywhere (a non-multiple); back ⇒ start high enough to land ≥0.
      const start = g.offset
        ? ri(back ? 4 * step + 1 : step + 1, Math.min(899 - (back ? 0 : 3 * step), 4 * step + 60))
        : step * ri(back ? 4 : 1, lerp(back ? 5 : 1, back ? 8 : 5, d));
      const dir = back ? -step : step;
      const seq = [start, start + dir, start + 2 * dir];
      return { ...base, prompt: `${seq.join(", ")}, ?`,
        spoken: `Keep counting ${back ? "back " : ""}by ${stepWords(step)}. ${seq.map(numberWords).join(", ")}. What comes next?`,
        answer: start + 3 * dir,
        hint: `${back ? "Take away" : "Add"} ${step} ${back ? "from" : "to"} the last number: ${seq[2]} ${back ? "minus" : "plus"} ${step}.` };
    }
    case "ten_more_less": {
      const steps = g.steps ?? [10];
      const step = steps[ri(0, steps.length - 1)];
      // Range must clear the step at low difficulty AND keep n+step ≤ 999.
      const hi = Math.min(Math.max(step * 2, lerp(Math.min(40, g.max), g.max, d)), 999 - step);
      const n = ri(step + 1, hi);
      const more = Math.random() < 0.5;
      return { ...base, prompt: `${n} ${more ? "+" : "−"} ${step}`,
        spoken: `What is ${step === 10 ? "ten" : step === 100 ? "a hundred" : step} ${more ? "more" : "less"} than ${n}?`,
        answer: more ? n + step : n - step,
        hint: `Only the ${step === 100 ? "hundreds" : "tens"} digit changes: it goes ${more ? "up" : "down"} by one.` };
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
        answer: q, hint: `Count by ${b}s up to ${b * q}: how many jumps did that take?` };
    }

    // ---- expansion batch (2026-07-10) ----------------------------------------
    case "two_digit_ones": {
      const a = ri(11, lerp(30, 89, d));
      if (Math.random() < 0.5) {
        const b = ri(1, Math.min(9, 99 - a));
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
          hint: `Only the ones change (unless they spill over ten): ${a % 10} plus ${b}.` };
      }
      const b = ri(1, Math.min(9, a % 10 === 0 ? 9 : a % 10 + (d > 0.6 ? 9 - a % 10 : 0) || 9));
      const bb = Math.min(b, 9);
      return { ...base, prompt: `${a} − ${bb}`, spoken: `What is ${a} minus ${bb}?`, answer: a - bb,
        hint: `Count back ${bb} from ${a}, or take ${bb} from the ones.` };
    }
    case "add_within_100": {
      if (Math.random() < 0.5) {
        const a = ri(11, 89), b = ri(1, Math.min(9, 99 - a));
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
          hint: `Start at ${a} and count on ${b}.` };
      }
      const a = ri(11, 79);
      const b = 10 * ri(1, Math.floor((99 - a) / 10));
      return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
        hint: `Only the tens change: ${Math.floor(a / 10)} tens plus ${b / 10} tens, keep the ${a % 10}.` };
    }
    case "add_2d2d": {
      const a = ri(10, lerp(20, 70, d));
      if (Math.random() < 0.5) {
        const b = ri(10, Math.min(89, 99 - a));
        return { ...base, prompt: `${a} + ${b}`, spoken: `What is ${a} plus ${b}?`, answer: a + b,
          hint: `Add the tens first (${Math.floor(a / 10)}0 + ${Math.floor(b / 10)}0), then the ones.` };
      }
      const big = Math.max(a, ri(10, 99)), small = ri(10, big);
      return { ...base, prompt: `${big} − ${small}`, spoken: `What is ${big} minus ${small}?`, answer: big - small,
        hint: `Take away the tens first, then the ones.` };
    }
    case "missing_any": {
      const whole = ri(5, lerp(8, g.max, d));
      const part = ri(1, whole - 1);
      const form = ri(0, 3);
      if (form === 0) return { ...base, prompt: `${part} + ? = ${whole}`, spoken: `${part} plus what makes ${whole}?`,
        answer: whole - part, hint: missingAddendHint(part, whole) };
      if (form === 1) return { ...base, prompt: `? + ${part} = ${whole}`, spoken: `What plus ${part} makes ${whole}?`,
        answer: whole - part, hint: `It's the other part of ${whole}: take ${part} away from ${whole}.` };
      if (form === 2) return { ...base, prompt: `${whole} − ? = ${part}`, spoken: `${whole} minus what leaves ${part}?`,
        answer: whole - part, hint: `How far is it from ${part} up to ${whole}?` };
      return { ...base, prompt: `? − ${part} = ${whole - part}`, spoken: `What number minus ${part} leaves ${whole - part}?`,
        answer: whole, hint: `Put the parts back together: ${part} plus ${whole - part}.` };
    }
    case "compare_pick": {
      const lo = ri(1, Math.max(2, lerp(5, g.max, d)) - 1);
      let hi = ri(lo + 1, Math.max(lo + 1, lerp(5, g.max, d)));
      const bigger = Math.random() < 0.5;
      const [x, y] = Math.random() < 0.5 ? [lo, hi] : [hi, lo];
      return { ...base, prompt: `${bigger ? "Bigger" : "Smaller"}: ${x} or ${y}?`,
        spoken: `Which number is ${bigger ? "bigger" : "smaller"} — ${x} or ${y}? Type it!`,
        answer: bigger ? Math.max(x, y) : Math.min(x, y),
        hint: g.max > 10
          ? `Look at the tens first: more tens means a bigger number.`
          : `Count up — the number you say later is bigger.` };
    }
    case "compose_hundreds": {
      const h = ri(1, lerp(3, 9, d)), t = ri(0, 9), o = ri(0, 9);
      return { ...base, prompt: `${h} hundreds ${t} tens ${o} ones`,
        spoken: `${h} hundreds, ${t} tens, and ${o} ones make what number?`,
        answer: h * 100 + t * 10 + o,
        hint: `${h} hundreds is ${h * 100}, add ${t * 10}, then ${o} more.` };
    }
    case "coins": {
      // 1-2 coin types, totals ≤ 99¢. Higher difficulty mixes types and uses quarters.
      const kinds = d < 0.4
        ? [{ name: "dime", v: 10 }, { name: "nickel", v: 5 }, { name: "penny", v: 1 }]
        : [{ name: "quarter", v: 25 }, { name: "dime", v: 10 }, { name: "nickel", v: 5 }, { name: "penny", v: 1 }];
      const a = kinds[ri(0, kinds.length - 1)];
      const useTwo = d > 0.3 && Math.random() < 0.7;
      const b = useTwo ? kinds.filter((k) => k.name !== a.name)[ri(0, kinds.length - 2)] : null;
      const na = ri(1, Math.min(3, Math.floor(60 / a.v)) || 1);
      const nb = b ? ri(1, Math.min(4, Math.floor((99 - na * a.v) / b.v)) || 1) : 0;
      const part = (n: number, c: { name: string }) => `${n} ${c.name}${n > 1 ? "s" : ""}`;
      const prompt = b && nb > 0 ? `${part(na, a)} + ${part(nb, b)} = ?¢` : `${part(na, a)} = ?¢`;
      const answer = na * a.v + (b ? nb * b.v : 0);
      return { ...base, prompt, answer,
        spoken: `How many cents is ${part(na, a)}${b && nb > 0 ? ` and ${part(nb, b)}` : ""}?`,
        hint: `Count the ${a.name}s by ${a.v}s${b && nb > 0 ? `, then add the ${b.name}s by ${b.v}s` : ""}.` };
    }
    case "money_sum": {
      if (Math.random() < 0.5) {
        const coin = Math.random() < 0.5 ? { name: "nickel", v: 5 } : { name: "dime", v: 10 };
        const n = ri(2, lerp(3, 9, d));
        return { ...base, prompt: `How many ${coin.name}s make ${n * coin.v}¢?`,
          spoken: `How many ${coin.name}s do you need to make ${n * coin.v} cents?`,
          answer: n, hint: `Count by ${coin.v}s until you reach ${n * coin.v}.` };
      }
      const need = 5 * ri(4, lerp(6, 18, d));
      const have = 5 * ri(1, need / 5 - 1);
      return { ...base, prompt: `${have}¢ + ?¢ = ${need}¢`,
        spoken: `You have ${have} cents and need ${need} cents. How many more cents?`,
        answer: need - have, hint: `Count up from ${have} to ${need} — try jumps of 5 or 10.` };
    }
    case "round_to": {
      const base10 = g.bases[d > 0.55 && g.bases.length > 1 ? 1 : 0];
      let n = 0;
      do { n = ri(base10 + 1, base10 === 10 ? 94 : 949); } while (n % base10 === 0);
      const answer = Math.round(n / base10) * base10;
      return { ...base, prompt: `Round ${n} to nearest ${base10}`,
        spoken: `Round ${n} to the nearest ${base10 === 10 ? "ten" : "hundred"}.`,
        answer,
        hint: `Which ${base10 === 10 ? "ten" : "hundred"} is ${n} closest to — ${Math.floor(n / base10) * base10} or ${Math.ceil(n / base10) * base10}?` };
    }
    case "odd_pick": {
      const wantOdd = Math.random() < 0.5;
      const cap = lerp(12, 30, d);
      const target = ri(1, Math.floor(cap / 2)) * 2 - (wantOdd ? 1 : 0);
      const others: number[] = [];
      while (others.length < 2) {
        const n = ri(1, Math.floor(cap / 2)) * 2 - (wantOdd ? 0 : 1);
        if (n !== others[0]) others.push(n);
      }
      const nums = [target, ...others].sort(() => Math.random() - 0.5);
      return { ...base, prompt: `${wantOdd ? "Odd" : "Even"} one: ${nums.join(", ")}`,
        spoken: `Which of these is ${wantOdd ? "odd" : "even"}: ${nums.join(", ")}? Type it!`,
        answer: target,
        hint: `Even numbers can be split into two equal teams — ${wantOdd ? "the odd one always has one left over" : "no leftovers"}. Check the last digit: 0, 2, 4, 6, 8 are even.` };
    }
  }
}
