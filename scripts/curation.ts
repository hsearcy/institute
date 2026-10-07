// scripts/curation.ts — THE curated topic list. Adding a topic to the game = add a
// row here (+ a GenSpec) and re-run `bun scripts/curate-topics.ts`.
import type { GenSpec } from "../shared/src/topics.ts";

export type CurationRow = {
  id: string;             // taxonomy id (mt_…)
  kidLabel: string;       // short HUD label
  legacySkill: "add_within_20" | "subtraction" | "skip_counting" | "place_value" | "multiplication" | "division";
  gen: GenSpec;
  fluentMs: number | null; // median first-try solve-time bar for mastery (null = accuracy only)
  /** Replace taxonomy text that doesn't fit this household (e.g. UK-curriculum
   *  money topics talk pounds/pence — this is an American kid). Feeds the LLM
   *  prompts AND the parent dashboard. */
  override?: { description?: string; evidence?: string[]; assessmentPrompt?: string };
  /** Hand-authored remediation edges the Marble taxonomy is missing. When he's
   *  stuck on this topic, these are the underlying skills to interleave (and the
   *  ladder `rescueTopic` steps down to). Merged into `helpPrereqs`. e.g. Fair
   *  Shares — division — has NO taxonomy prereqs, but skip-counting is what it
   *  actually leans on. Soft only: they never gate/lock the topic. */
  extraHelpPrereqs?: string[];
  /** Hand-authored HARD prereqs (unlock gates) merged with the taxonomy's. */
  extraPrereqs?: string[];
  /** A topic the taxonomy does not have (id outside its mt_ namespace): the
   *  fields the taxonomy row would otherwise supply. */
  custom?: { name: string; domain: string; ageRange: [number, number]; description: string; evidence: string[]; assessmentPrompt: string };
};

const TT = "mt_HhuSDxwDNM";       // Times Tables (2, 5, 10)
const TT2 = "mt_wQ89AEXhz3";      // Times Tables II (3, 4, 8 mixed)
const TT_MASTER = "mt_K5jM7vlVhA";

/** One times table per topic (2026-10-07). Learning 3/4/8 and 2..12 as one mixed
 *  bag of random facts was slow and frustrating; each table now gets its own
 *  topic with a fading fact ladder (server/src/visuals.ts), and the mixed topics
 *  become the interleaved review that unlocks once its tables are mastered.
 *  2, 5 and 10 stay in Times Tables, the entry topic. */
function tableRow(n: number, prereqs: string[], helps: string[], age: [number, number]): CurationRow {
  return {
    id: `tt_${n}`, kidLabel: `${n}s Table`, legacySkill: "multiplication",
    gen: { kind: "table", table: n }, fluentMs: 7000,
    extraPrereqs: prereqs, extraHelpPrereqs: helps,
    custom: {
      name: `The ${n} times table`, domain: "Multiplication & Division", ageRange: age,
      description: `Know the ${n} times table from ${n} × 1 to ${n} × 12 by heart`,
      evidence: [
        `Say ${n} × 7 without counting up from the start`,
        `Use a known fact like ${n} × 5 to work out a nearby one`,
        `Answer any ${n} times fact within a few seconds`,
      ],
      assessmentPrompt: `Can {{name}} tell you ${n} × 6, ${n} × 7 and ${n} × 8 quickly, without counting by ${n}s from the start?`,
    },
  };
}
const TABLES: CurationRow[] = [
  tableRow(3, [TT], ["mt_aHAM29nidj"], [6, 7]),           // ← Counting by 3s
  tableRow(4, [TT], ["mt_IzQvs7k_sE"], [6, 7]),           // ← Super Skips (4s)
  tableRow(6, ["tt_3"], ["mt_7rJM8eWUfw"], [7, 8]),       // ← Big Skips (6s)
  tableRow(8, ["tt_4"], ["mt_IzQvs7k_sE"], [7, 8]),
  tableRow(9, ["tt_3"], ["mt_7rJM8eWUfw"], [7, 8]),
  tableRow(7, ["tt_6"], ["mt_7rJM8eWUfw"], [7, 8]),
  tableRow(11, ["tt_9"], [], [8, 9]),
  tableRow(12, ["tt_9"], ["tt_6"], [8, 9]),
];

export const CURATION: CurationRow[] = [
  { id: "mt_M5PPDJStGm", kidLabel: "Counting",         legacySkill: "skip_counting",  gen: { kind: "next_number", max: 100 },                      fluentMs: null },
  { id: "mt_ghF3Vv6taM", kidLabel: "Add & Take to 5",  legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 5 },                             fluentMs: 7000 },
  { id: "mt_e8CZ7E5qW7", kidLabel: "Number Bonds",     legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 10 },                fluentMs: null },
  { id: "mt__we2TDqnJx", kidLabel: "Add & Take to 10", legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 10 },                            fluentMs: 6000 },
  { id: "mt_m1W6nTQJ2b", kidLabel: "Add & Take to 20", legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 20, carry: true },               fluentMs: null },
  { id: "mt__t4afSyZRm", kidLabel: "Lightning 20s",    legacySkill: "add_within_20",  gen: { kind: "add_sub", max: 20, carry: true },               fluentMs: 8000 },
  { id: "mt_Zx1xZM-RbX", kidLabel: "Triple Add",       legacySkill: "add_within_20",  gen: { kind: "add3", sumMax: 20 },                            fluentMs: null },
  { id: "mt_ezc2m_0dzN", kidLabel: "Mystery Number",   legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 20 },                fluentMs: null },
  { id: "mt_nvdpxAJTBG", kidLabel: "Counting by 2s",   legacySkill: "skip_counting",  gen: { kind: "skip", steps: [2] },                            fluentMs: null },
  { id: "mt_kw7xmp68rU", kidLabel: "Ten Jumps",        legacySkill: "place_value",    gen: { kind: "ten_more_less", max: 90 },                      fluentMs: null },
  { id: "mt_THl9GLxwoL", kidLabel: "Tens & Ones",      legacySkill: "place_value",    gen: { kind: "compose_tens", tensMax: 9 },                    fluentMs: null },
  { id: "mt_I5j1ZWo2cn", kidLabel: "Tens Math",        legacySkill: "place_value",    gen: { kind: "add_sub_tens" },                                fluentMs: null },
  { id: "mt_PZ909yPrEC", kidLabel: "Groups Of",        legacySkill: "multiplication", gen: { kind: "mul", tables: [2, 5, 10] },                     fluentMs: null },
  { id: TT, kidLabel: "Times Tables",     legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 5, 10] },                 fluentMs: 7000 },
  { id: "mt_LpSuPgL31x", kidLabel: "Fair Shares",      legacySkill: "division",       gen: { kind: "div", divisors: [2, 3, 4, 5], quotientMax: 5 }, fluentMs: null,
    // Division IS skip-counting by the divisor — his actual solving strategy — but
    // Marble gives this topic no prereqs, so he had no ladder down. Wire it in.
    // The 3s and 4s tables (2026-10-07) are the facts its ÷3 and ÷4 rest on.
    extraHelpPrereqs: ["mt_nvdpxAJTBG", "mt_aHAM29nidj", "mt_OkSJfrmFb_", "tt_3", "tt_4"] }, // Counting by 2s / 3s / Ten Hops
  // ---- expansion batch (2026-07-10): 20 topics, ages 5-8 ----------------------
  { id: "mt_s2mfRBoTal", kidLabel: "Bond Master",       legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 20 },               fluentMs: 7000,
    // He stalls crossing ten (4 + ? = 18). The make-a-ten skill is the scaffold;
    // his mastered single-digit bonds don't cover it. Interleave Add & Take to 10.
    extraHelpPrereqs: ["mt__we2TDqnJx"] }, // Add & Take to 10
  { id: "mt_AKAtWEwpcj", kidLabel: "Big Number Add",    legacySkill: "add_within_20",  gen: { kind: "two_digit_ones" },                             fluentMs: null },
  { id: "mt_glPPG-kTQY", kidLabel: "Climb to 100",      legacySkill: "add_within_20",  gen: { kind: "add_within_100" },                             fluentMs: null },
  { id: "mt_UQnAFPs83F", kidLabel: "Double Digits",     legacySkill: "add_within_20",  gen: { kind: "add_2d2d" },                                   fluentMs: null },
  { id: "mt_cChv2j_-Da", kidLabel: "Lightning 100s",    legacySkill: "add_within_20",  gen: { kind: "add_2d2d" },                                   fluentMs: 10000 },
  { id: "mt_3JgrHY221M", kidLabel: "Mystery Master",    legacySkill: "add_within_20",  gen: { kind: "missing_any", max: 20 },                       fluentMs: null },
  { id: "mt__YRJ23GuIK", kidLabel: "Bigger or Smaller", legacySkill: "skip_counting",  gen: { kind: "compare_pick", max: 10 },                      fluentMs: null },
  { id: "mt_aHAM29nidj", kidLabel: "Counting by 3s",    legacySkill: "skip_counting",  gen: { kind: "skip", steps: [3], back: true },               fluentMs: null },
  { id: "mt_OkSJfrmFb_", kidLabel: "Ten Hops Anywhere", legacySkill: "skip_counting",  gen: { kind: "skip", steps: [10], offset: true },            fluentMs: null },
  { id: "mt_IzQvs7k_sE", kidLabel: "Super Skips",       legacySkill: "skip_counting",  gen: { kind: "skip", steps: [4, 8, 50, 100] },               fluentMs: null },
  { id: "mt_M2v1A9OEuM", kidLabel: "Counting to 1000",  legacySkill: "skip_counting",  gen: { kind: "skip", steps: [5, 10, 100], offset: true },    fluentMs: null },
  { id: "mt_wh3UqnWsa7", kidLabel: "Groups Galore",     legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 3, 4, 5, 10] },          fluentMs: null,
    // Mixed 2/3/4/5/10: when he is stuck here, the single 3s and 4s tables are the cure.
    extraHelpPrereqs: ["tt_3", "tt_4"] },
  { id: TT2, kidLabel: "Times Tables II",   legacySkill: "multiplication", gen: { kind: "mul_div", tables: [3, 4, 8] },                 fluentMs: 7000,
    extraPrereqs: ["tt_3", "tt_4", "tt_8"] },
  { id: TT_MASTER, kidLabel: "Times Tables Master", legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], maxFactor: 12 }, fluentMs: 8000,
    extraPrereqs: TABLES.map((t) => t.id) },
  { id: "mt_0u4KLbvBa1", kidLabel: "Odd One Out",       legacySkill: "division",       gen: { kind: "odd_pick" },                                   fluentMs: null },
  { id: "mt_U0waNfD8PB", kidLabel: "Number Battles",    legacySkill: "place_value",    gen: { kind: "compare_pick", max: 99 },                      fluentMs: null },
  { id: "mt_aPBzD28_mT", kidLabel: "Hundreds & More",   legacySkill: "place_value",    gen: { kind: "compose_hundreds" },                           fluentMs: null },
  { id: "mt_izien3ZX51", kidLabel: "Jump 10s & 100s",   legacySkill: "place_value",    gen: { kind: "ten_more_less", max: 900, steps: [10, 100] },  fluentMs: null },
  { id: "mt_cPZwlUk8Nd", kidLabel: "Coin Counter",      legacySkill: "skip_counting",  gen: { kind: "coins" },                                      fluentMs: null,
    override: {
      description: "Recognize US coins and know their values in cents",
      evidence: [
        "Know a penny is 1 cent, a nickel is 5, a dime is 10, and a quarter is 25",
        "Add up a small handful of coins to a total in cents",
        "Know a quarter is worth more than a dime even though it is not much bigger",
      ],
      assessmentPrompt: "If {{name}} is given a handful of coins, can they name each one — penny, nickel, dime, quarter — and tell you how many cents each is worth?",
    } },
  { id: "mt_AF2BeFQwfX", kidLabel: "Money Maker",       legacySkill: "skip_counting",  gen: { kind: "money_sum" },                                  fluentMs: null,
    override: {
      description: "Make amounts of money in cents using different combinations of US coins",
      evidence: [
        "Show that 50 cents can be made with 2 quarters, or 5 dimes, or 10 nickels",
        "Work out how many more cents are needed to reach an amount",
        "Count up by 5s, 10s, and 25s to total mixed coins",
      ],
      assessmentPrompt: "If {{name}} needs to make exactly 30 cents, can they find two different ways to do it — like a quarter and a nickel, or three dimes?",
    } },
  { id: "mt_QaYfeVL-0C", kidLabel: "Rounding Ranger",   legacySkill: "place_value",    gen: { kind: "round_to", bases: [10, 100] },                 fluentMs: null },
  // ---- expansion batch (2026-09-08): the post-30-mastered frontier, 14 topics ----
  { id: "mt_7rJM8eWUfw", kidLabel: "Big Skips",         legacySkill: "skip_counting",  gen: { kind: "skip", steps: [6, 7, 8, 9] },                    fluentMs: null },
  { id: "mt_3XJkeIn6J6", kidLabel: "Round & Add",       legacySkill: "place_value",    gen: { kind: "estimate_sum" },                                 fluentMs: null, extraHelpPrereqs: ["mt_QaYfeVL-0C", "mt_I5j1ZWo2cn"],
    override: { description: "Estimate a sum by rounding each number to the nearest ten first, then adding the tens",
      evidence: ["Round 48 to 50 and 31 to 30 before adding", "Say that 48 + 31 is about 80", "Use the estimate to check whether an exact answer is sensible"],
      assessmentPrompt: "If {{name}} sees 48 + 31, can they say it is about 80 by rounding each number to the nearest ten first?" } },
  { id: "mt_ewmuMMPAzP", kidLabel: "Big Add to 1000",   legacySkill: "add_within_20",  gen: { kind: "add_sub_3d", op: "add" },                        fluentMs: null },
  { id: "mt_HFRYjTb-Z5", kidLabel: "Big Take to 1000",  legacySkill: "subtraction",    gen: { kind: "add_sub_3d", op: "sub" },                        fluentMs: null },
  { id: "mt_XuHmIn2xje", kidLabel: "Mystery to 100",    legacySkill: "add_within_20",  gen: { kind: "missing_any", max: 100 },                        fluentMs: null },
  { id: "mt_xZvDCYA5Ae", kidLabel: "Missing Factor",    legacySkill: "multiplication", gen: { kind: "missing_factor", maxFactor: 10 },               fluentMs: null },
  { id: "mt_DyGBW3ZHh3", kidLabel: "Written Times",     legacySkill: "multiplication", gen: { kind: "mul_2d1d" },                                     fluentMs: null },
  { id: "mt_p-nbe0w_lf", kidLabel: "Leftovers",         legacySkill: "division",       gen: { kind: "div_rem", maxDivisor: 9 },                       fluentMs: null },
  { id: "mt_cFltwUQi-d", kidLabel: "Fair Fractions",    legacySkill: "division",       gen: { kind: "frac_of", dens: [2, 3, 4, 5, 10] },              fluentMs: null },
  { id: "mt_g3W0mdADVu", kidLabel: "Double & Half",     legacySkill: "add_within_20",  gen: { kind: "double_half", max: 100 },                        fluentMs: null,
    // Halving 158 is: split into 100, 50, 8, halve each, add. That is place value
    // and tens arithmetic, not division facts (its only taxonomy prereq).
    extraHelpPrereqs: ["mt_aPBzD28_mT", "mt_I5j1ZWo2cn"], // Hundreds & More, Tens Math
    override: { description: "Double a number and find half of an even number, up to 200",
      evidence: ["Double 34 by doubling the tens and the ones", "Find half of 60 by halving the tens", "Know that halving undoes doubling"],
      assessmentPrompt: "Can {{name}} tell you double 34, and half of 60, without counting one by one?" } },
  { id: "mt_6_O6THdEDK", kidLabel: "Giving Change",     legacySkill: "subtraction",    gen: { kind: "change_from" },                                  fluentMs: null,
    override: { description: "Work out the change from 50 cents or a dollar by counting up from the price",
      evidence: ["Count up from 65 cents to a dollar to find 35 cents change", "Use jumps of 5 and 10 to reach the next ten and then the dollar"],
      assessmentPrompt: "If something costs 65 cents and {{name}} pays with a dollar, can they work out the change by counting up?" } },
  { id: "mt_2XDGT5tei1", kidLabel: "Minute Math",       legacySkill: "skip_counting",  gen: { kind: "time_minutes" },                                 fluentMs: null, extraHelpPrereqs: ["mt_M2v1A9OEuM"] },
  { id: "mt_wE7-Gs9ENL", kidLabel: "Fence Fixer",       legacySkill: "add_within_20",  gen: { kind: "perimeter_rect" },                               fluentMs: null, extraHelpPrereqs: ["mt_m1W6nTQJ2b"] },
  { id: "mt_Jvvh5P06NV", kidLabel: "Tile Floor",        legacySkill: "multiplication", gen: { kind: "area_tiles" },                                   fluentMs: null, extraHelpPrereqs: ["mt_PZ909yPrEC"] },
  ...TABLES,
];
