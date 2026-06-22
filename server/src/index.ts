// Institute tutor server (Bun + Hono + bun:sqlite).
//  - POST /tutor/first    → instant first problem (local; uses stored mastery)
//  - POST /tutor/branches → LLM pre-generates BOTH follow-ups for the on-screen
//                           problem (validated; local fallback). Hides latency.
//  - POST /tutor/attempt  → record an answer (drives mastery + adaptivity)
//  - POST /tts            → ElevenLabs reads text aloud
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import Anthropic from "@anthropic-ai/sdk";
import {
  SKILLS, SKILL_LABELS, ProblemSchema, type Problem,
  StartRequestSchema, BranchesRequestSchema, TtsRequestSchema,
} from "@institute/shared";
import { localProblem, pickStart, type ProblemDraft, type SkillStat } from "./generate.ts";

const PORT = Number(process.env.PORT ?? 8787);
const TUTOR_MODEL = process.env.TUTOR_MODEL ?? "claude-haiku-4-5-20251001";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

// ---- DB --------------------------------------------------------------------
const db = new Database(process.env.DB_PATH ?? "data/institute.db", { create: true });
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    skill TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    ladder INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    correct INTEGER NOT NULL,
    solve_ms INTEGER NOT NULL,
    difficulty REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_profile ON attempts(profile_id, created_at);
  CREATE TABLE IF NOT EXISTS mastery (
    profile_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    last_difficulty REAL NOT NULL DEFAULT 0.5,
    state TEXT NOT NULL DEFAULT 'practicing',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, skill)
  );
`);
// Seed the skill ladder (categories + descent order) from the shared schema.
const seedSkill = db.query(`INSERT OR IGNORE INTO skills (skill, label, ladder) VALUES (?, ?, ?)`);
SKILLS.forEach((s, i) => seedSkill.run(s, SKILL_LABELS[s], i));

/** Upsert per-skill mastery after each attempt (drives adaptivity + the deferred dashboard). */
function recordMastery(profileId: string, skill: string, correct: boolean, difficulty: number): void {
  const row = db.query(`SELECT attempts, correct FROM mastery WHERE profile_id = ? AND skill = ?`)
    .get(profileId, skill) as { attempts: number; correct: number } | null;
  const attempts = (row?.attempts ?? 0) + 1;
  const corr = (row?.correct ?? 0) + (correct ? 1 : 0);
  const state = attempts >= 8 && corr / attempts >= 0.85 ? "mastered" : "practicing";
  db.query(
    `INSERT INTO mastery (profile_id, skill, attempts, correct, last_difficulty, state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, skill) DO UPDATE SET
       attempts = excluded.attempts, correct = excluded.correct,
       last_difficulty = excluded.last_difficulty, state = excluded.state, updated_at = excluded.updated_at`,
  ).run(profileId, skill, attempts, corr, difficulty, state, Date.now());
}

function skillStats(profileId: string): SkillStat[] {
  const rows = db.query(
    `SELECT skill, COUNT(*) n, SUM(correct) c, AVG(difficulty) d
     FROM attempts WHERE profile_id = ? GROUP BY skill`,
  ).all(profileId) as { skill: string; n: number; c: number; d: number }[];
  return rows
    .filter((r) => (SKILLS as readonly string[]).includes(r.skill))
    .map((r) => ({ skill: r.skill as SkillStat["skill"], attempts: r.n, correct: r.c ?? 0, avgDifficulty: r.d ?? 0.5 }));
}

function recentAttempts(profileId: string, n: number) {
  return db.query(
    `SELECT skill, correct, solve_ms, difficulty FROM attempts
     WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(profileId, n) as { skill: string; correct: number; solve_ms: number; difficulty: number }[];
}

let idCounter = 0;
const stampId = (d: ProblemDraft): Problem => ({ ...d, id: `p${Date.now().toString(36)}_${idCounter++}` });

// ---- LLM tutor -------------------------------------------------------------
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROBLEM_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    skill: { type: "string", enum: [...SKILLS] },
    prompt: { type: "string", description: "Written form on the rock, e.g. \"8 + 7\" or \"5, 10, 15, ?\"" },
    spoken: { type: "string", description: "Kid-friendly spoken form, e.g. \"What is 8 plus 7?\"" },
    answer: { type: "integer", description: "The correct numeric answer the kid keys in" },
    difficulty: { type: "number", description: "0..1" },
    hint: { type: "string", description: "One warm, concrete strategy hint a 6-year-old can act on if stuck — e.g. make-a-ten: \"Make a ten! 8 plus 2 is 10, then 5 more makes 15.\" Not just the answer." },
  },
  required: ["skill", "prompt", "spoken", "answer", "difficulty", "hint"],
  additionalProperties: false,
} as const;

const BRANCHES_TOOL = {
  name: "next_problems",
  description: "The next math problem for BOTH outcomes of the current one.",
  input_schema: {
    type: "object",
    properties: { right: PROBLEM_DRAFT_SCHEMA, wrong: PROBLEM_DRAFT_SCHEMA },
    required: ["right", "wrong"],
    additionalProperties: false,
  },
} as const;

const SYSTEM = `You are the adaptive tutor inside "Institute", a gem-mine math game for one 6-year-old. Each turn you produce the next problem for BOTH outcomes of the problem he is solving right now — "right" (he answers correctly) and "wrong" (he misses it) — so the game can instantly load whichever happens.

You are given his LIVE per-skill mastery and concrete difficulty targets computed from his real attempts. Follow that data and those targets. Do NOT assume fixed strengths or weaknesses — they change as he learns.

Rules:
- add_within_20: BOTH addends are single digits (1–9). "difficulty" controls how much it crosses ten (the "make a ten" skill), NOT the size of the addends: ≈0.3 → sum ≤ 10 (no carrying); ≈0.6 → sums up to ~14; ≈0.9 → sums 13–18 that cross ten (e.g. 7+8, 9+6, 8+5). NEVER use a two-digit addend (no "8 + 12"), and do NOT land on the same total repeatedly — especially do not keep making 20.
- subtraction: minuend ≤ 20, single steps; difficulty controls size and whether it crosses ten (e.g. easy 9−4; harder 15−7). Vary the numbers.
- "difficulty" (0..1) must match the target you are given.
- Keep him productive: "right" stretches a little harder, "wrong" eases off and rebuilds confidence in the SAME skill.
- Stay mostly in addition-within-20 and subtraction; introduce skip_counting/place_value lightly, and multiplication/division only when an advance hint explicitly clears it.
- VARY the numbers a lot: consecutive problems must not share the same total and must not be permutations of one another (8+12, 9+11 are bad — repetitive). Never reuse the problem he is on.
- "prompt" is the short written form; "spoken" is a warm, kid-friendly sentence to read aloud (no emoji/markdown). "answer" is the exact integer.
- "hint" teaches a concrete strategy he can act on if he's stuck (make-a-ten, count-on, count-back) — a real method, never just restating the answer.
Return via the next_problems tool only.`;

type SkillSummary = { skill: string; label: string; attempts: number; accuracy: number; state: string; avgDifficulty: number };

/** Per-skill mastery summary built fresh each call from the DB (replaces a frozen persona). */
function learnerSummaries(profileId: string): SkillSummary[] {
  const rows = db.query(
    `SELECT s.skill, s.label, m.attempts, m.correct, m.last_difficulty, m.state
     FROM skills s LEFT JOIN mastery m ON m.skill = s.skill AND m.profile_id = ?
     ORDER BY s.ladder`,
  ).all(profileId) as { skill: string; label: string; attempts: number | null; correct: number | null; last_difficulty: number | null; state: string | null }[];
  return rows.map((r) => ({
    skill: r.skill,
    label: r.label,
    attempts: r.attempts ?? 0,
    accuracy: r.attempts ? (r.correct ?? 0) / r.attempts : 0,
    state: r.state ?? "unstarted",
    avgDifficulty: r.last_difficulty ?? 0.4,
  }));
}

function describeLearner(sums: SkillSummary[]): string {
  const lines = sums.map((s) => {
    if (s.attempts === 0) return `- ${s.label}: not started`;
    const pct = Math.round(s.accuracy * 100);
    const tag = s.state === "mastered" ? "mastered" : s.accuracy < 0.6 ? "shaky" : s.accuracy < 0.8 ? "developing" : "strong";
    return `- ${s.label}: ${tag} (${pct}% over ${s.attempts} attempts, recently around difficulty ${s.avgDifficulty.toFixed(2)})`;
  });
  return `His current mastery, computed from his real attempts:\n${lines.join("\n")}`;
}

function nextLadderSkill(skill: string): string | null {
  const order = SKILLS as readonly string[];
  const i = order.indexOf(skill);
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
}

const clampDiff = (x: number) => Math.max(0.1, Math.min(0.97, x));

/** Compute concrete difficulty targets + a solve-pace tag to steer the model. */
function adaptivePlan(
  current: Problem,
  recent: { skill: string; correct: number; solve_ms: number }[],
  sums: SkillSummary[],
) {
  const cur = current.difficulty;
  const skillRecent = recent.filter((r) => r.skill === current.skill);
  const recentAcc = skillRecent.length ? skillRecent.filter((r) => r.correct).length / skillRecent.length : 0.7;
  const lastMs = recent[0]?.solve_ms ?? 0;
  const solveTag = lastMs === 0 ? "unknown" : lastMs < 4000 ? "fast" : lastMs < 9000 ? "steady" : "slow";
  // Push harder when he's accurate and fast; ease more when he's struggling.
  const up = (recentAcc >= 0.8 ? 0.14 : recentAcc >= 0.6 ? 0.08 : 0.04) + (solveTag === "fast" ? 0.04 : 0);
  const down = 0.12 + (recentAcc < 0.5 ? 0.05 : 0);
  const curSummary = sums.find((s) => s.skill === current.skill);
  const advanceSkill = curSummary && curSummary.state === "mastered" ? nextLadderSkill(current.skill) : null;
  return {
    rightTarget: +clampDiff(cur + up).toFixed(2),
    wrongTarget: +clampDiff(cur - down).toFixed(2),
    solveTag,
    recentAccuracyPct: Math.round(recentAcc * 100),
    advanceSkill,
  };
}

// Recently-served problem prompts per profile (in-memory) so the tutor avoids repeats.
const recentPrompts = new Map<string, string[]>();
function notePrompt(profileId: string, prompt: string): void {
  const arr = recentPrompts.get(profileId) ?? [];
  arr.push(prompt);
  while (arr.length > 12) arr.shift();
  recentPrompts.set(profileId, arr);
}
/** A locally-generated problem whose prompt isn't already in `taken`. */
function freshLocal(skill: Problem["skill"], difficulty: number, taken: Set<string>): Problem {
  for (let i = 0; i < 10; i++) {
    const p = stampId(localProblem(skill, difficulty));
    if (!taken.has(p.prompt)) { taken.add(p.prompt); return p; }
  }
  return stampId(localProblem(skill, difficulty));
}

async function llmBranches(profileId: string, current: Problem): Promise<{ right: Problem; wrong: Problem }> {
  const sums = learnerSummaries(profileId);
  const plan = adaptivePlan(current, recentAttempts(profileId, 10), sums);
  const avoid = recentPrompts.get(profileId) ?? [];
  const userContent = [
    describeLearner(sums),
    "",
    `He is solving now: "${current.prompt}"  (skill: ${current.skill}, difficulty: ${current.difficulty.toFixed(2)}).`,
    `His last problem was answered ${plan.solveTag}; his recent accuracy on ${current.skill} is ${plan.recentAccuracyPct}%.`,
    avoid.length ? `Recently shown already — do NOT repeat any of these: ${avoid.join("; ")}.` : "",
    "",
    "Produce the two follow-ups, matching difficulty to these targets:",
    `- "right" (he answers correctly): difficulty ≈ ${plan.rightTarget}` +
      (plan.advanceSkill ? `, and since he has MASTERED ${current.skill} you may move up to ${plan.advanceSkill}.` : `, staying in ${current.skill}.`),
    `- "wrong" (he misses it): reinforce ${current.skill} at difficulty ≈ ${plan.wrongTarget} with friendlier numbers.`,
    `Vary the numbers; do not reuse "${current.prompt}".`,
  ].filter(Boolean).join("\n");
  const resp = await anthropic.messages.create({
    model: TUTOR_MODEL,
    max_tokens: 1024,
    temperature: 0.9,
    system: SYSTEM,
    tools: [BRANCHES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "next_problems" },
    messages: [{ role: "user", content: userContent }],
  });
  const tool = resp.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("no tool_use in response");
  const raw = tool.input as { right: unknown; wrong: unknown };
  let right = ProblemSchema.parse(stampId(correctDraft(raw.right as ProblemDraft)));
  let wrong = ProblemSchema.parse(stampId(correctDraft(raw.wrong as ProblemDraft)));
  // Reject repeats (the just-solved problem or anything recently shown); regenerate locally.
  const taken = new Set<string>([current.prompt, ...avoid]);
  if (taken.has(right.prompt)) right = freshLocal(right.skill, right.difficulty, taken);
  else taken.add(right.prompt);
  if (taken.has(wrong.prompt)) wrong = freshLocal(wrong.skill, wrong.difficulty, taken);
  notePrompt(profileId, right.prompt);
  notePrompt(profileId, wrong.prompt);
  return { right, wrong };
}

/** Recompute the answer for a parseable binary arithmetic prompt; null otherwise. */
function arithmeticAnswer(prompt: string): number | null {
  const m = prompt.replace(/[−–—]/g, "-").match(/^\s*(\d+)\s*([+\-x×*÷/])\s*(\d+)\s*$/i);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2].toLowerCase()) {
    case "+": return a + b;
    case "-": return a - b;
    case "x": case "×": case "*": return a * b;
    case "÷": case "/": return b === 0 ? null : a / b;
    default: return null;
  }
}

/** Trust math over the model: if the written prompt is a parseable expression whose
 *  true value differs from the model's answer, correct it. The kid is never shown a
 *  problem whose displayed answer is wrong. */
function correctDraft(d: ProblemDraft): ProblemDraft {
  const truth = arithmeticAnswer(d.prompt);
  if (truth !== null && Number.isInteger(truth) && truth !== d.answer) {
    console.warn(`[tutor] corrected "${d.prompt}": answer ${d.answer} -> ${truth}`);
    return { ...d, answer: truth };
  }
  return d;
}

/** Local fallback branches: harder on right, easier same-skill on wrong. */
function localBranches(current: Problem): { right: Problem; wrong: Problem } {
  return {
    right: stampId(localProblem(current.skill, Math.min(0.95, current.difficulty + 0.12))),
    wrong: stampId(localProblem(current.skill, Math.max(0.15, current.difficulty - 0.12))),
  };
}

// ---- App -------------------------------------------------------------------
const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, model: TUTOR_MODEL }));

app.post("/tutor/first", async (c) => {
  const { profileId } = StartRequestSchema.parse(await c.req.json());
  const problem = stampId(pickStart(skillStats(profileId)));
  notePrompt(profileId, problem.prompt);
  return c.json(problem);
});

// Speculative pre-generation: both "if right" and "if wrong" follow-ups for the
// current problem. Spec names this /next-problems; /tutor/branches is kept as an alias.
async function nextProblems(c: Context) {
  const { profileId, current } = BranchesRequestSchema.parse(await c.req.json());
  try {
    return c.json(await llmBranches(profileId, current));
  } catch (e) {
    console.warn("[tutor] LLM branches failed; local fallback:", (e as Error)?.message);
    return c.json(localBranches(current));
  }
}
app.post("/next-problems", nextProblems);
app.post("/tutor/branches", nextProblems);

app.post("/tutor/attempt", async (c) => {
  const body = await c.req.json();
  const { profileId, problemId, skill, correct, solveMs } = body;
  const difficulty = typeof body.difficulty === "number" ? body.difficulty : 0.5;
  db.query(
    `INSERT INTO attempts (profile_id, problem_id, skill, correct, solve_ms, difficulty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(profileId, problemId, skill, correct ? 1 : 0, Math.round(solveMs ?? 0), difficulty, Date.now());
  recordMastery(profileId, skill, !!correct, difficulty);
  return c.json({ ok: true });
});

// Per-skill mastery view (server-side data for the deferred parent dashboard).
app.get("/mastery", (c) => {
  const profileId = c.req.query("profileId") ?? "sam";
  const rows = db.query(
    `SELECT s.skill, s.label, s.ladder, m.attempts, m.correct, m.last_difficulty, m.state
     FROM skills s LEFT JOIN mastery m ON m.skill = s.skill AND m.profile_id = ?
     ORDER BY s.ladder`,
  ).all(profileId);
  return c.json({ profileId, skills: rows });
});

app.post("/tts", async (c) => {
  const { text } = TtsRequestSchema.parse(await c.req.json());
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return c.json({ error: "no tts key" }, 503);
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // Warm + expressive for an encouraging kid tutor; slower so a 6-year-old can follow.
      // stability lower = more emotional range; style adds warmth; speed 0.7–1.2 (1.0 default).
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.78 },
      }),
    },
  );
  if (!r.ok) return c.json({ error: `tts ${r.status}` }, 502);
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg" } });
});

console.log(`[institute] tutor server on :${PORT} (model ${TUTOR_MODEL})`);
export default { port: PORT, fetch: app.fetch };
