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
};

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
  { id: "mt_HhuSDxwDNM", kidLabel: "Times Tables",     legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 5, 10] },                 fluentMs: 7000 },
  { id: "mt_LpSuPgL31x", kidLabel: "Fair Shares",      legacySkill: "division",       gen: { kind: "div", divisors: [2, 3, 4, 5], quotientMax: 5 }, fluentMs: null },
  // ---- expansion batch (2026-07-10): 20 topics, ages 5-8 ----------------------
  { id: "mt_s2mfRBoTal", kidLabel: "Bond Master",       legacySkill: "add_within_20",  gen: { kind: "missing_addend", totalMax: 20 },               fluentMs: 7000 },
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
  { id: "mt_wh3UqnWsa7", kidLabel: "Groups Galore",     legacySkill: "multiplication", gen: { kind: "mul_div", tables: [2, 3, 4, 5, 10] },          fluentMs: null },
  { id: "mt_wQ89AEXhz3", kidLabel: "Times Tables II",   legacySkill: "multiplication", gen: { kind: "mul_div", tables: [3, 4, 8] },                 fluentMs: 7000 },
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
];
