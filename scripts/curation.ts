// scripts/curation.ts — THE curated topic list. Adding a topic to the game = add a
// row here (+ a GenSpec) and re-run `bun scripts/curate-topics.ts`.
// GenSpec lives here until Task 3 moves it into shared/src/topics.ts (which can't
// exist before topics.json is first generated).
export type GenSpec =
  | { kind: "add_sub"; max: number; carry?: boolean }
  | { kind: "missing_addend"; totalMax: number }
  | { kind: "add3"; sumMax: number }
  | { kind: "next_number"; max: number }
  | { kind: "skip"; steps: number[] }
  | { kind: "ten_more_less"; max: number }
  | { kind: "compose_tens"; tensMax: number }
  | { kind: "add_sub_tens" }
  | { kind: "mul"; tables: number[] }
  | { kind: "mul_div"; tables: number[] }
  | { kind: "div"; divisors: number[]; quotientMax: number };

export type CurationRow = {
  id: string;             // taxonomy id (mt_…)
  kidLabel: string;       // short HUD label
  legacySkill: "add_within_20" | "subtraction" | "skip_counting" | "place_value" | "multiplication" | "division";
  gen: GenSpec;
  fluentMs: number | null; // median first-try solve-time bar for mastery (null = accuracy only)
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
];
