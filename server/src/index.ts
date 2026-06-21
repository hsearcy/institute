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
  },
  required: ["skill", "prompt", "spoken", "answer", "difficulty"],
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

const SYSTEM = `You are an adaptive math tutor for a 6-year-old. He has solid number sense and addition within 10; he finger-counts past 10, subtraction is shaky, skip-counting and place value are developing, and he's curious about a little multiplication/division.

You generate the next problem for BOTH outcomes of the problem he's solving right now:
- "right": he got it right — build on it (slightly harder, or stretch toward the next skill) using his solve speed as a signal (fast+right → push more).
- "wrong": he got it wrong — reinforce: same skill, easier numbers, rebuild confidence.

Rules:
- Stay in his zone (mostly addition-within-20 and subtraction; light skip_counting/place_value; rare multiplication/division only when he's clearly ready).
- Vary the specific numbers so problems never feel repetitive.
- "prompt" is the short written form; "spoken" is a warm, kid-friendly sentence to read aloud (no emoji/markdown).
- "answer" is the exact integer.
Return via the next_problems tool only.`;

async function llmBranches(profileId: string, current: Problem): Promise<{ right: Problem; wrong: Problem }> {
  const ctx = {
    currentProblem: { skill: current.skill, prompt: current.prompt, answer: current.answer, difficulty: current.difficulty },
    perSkill: skillStats(profileId),
    recent: recentAttempts(profileId, 8),
  };
  const resp = await anthropic.messages.create({
    model: TUTOR_MODEL,
    max_tokens: 1024,
    temperature: 0.8,
    system: SYSTEM,
    tools: [BRANCHES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "next_problems" },
    messages: [{ role: "user", content: JSON.stringify(ctx) }],
  });
  const tool = resp.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("no tool_use in response");
  const raw = tool.input as { right: unknown; wrong: unknown };
  let right = ProblemSchema.parse(stampId(correctDraft(raw.right as ProblemDraft)));
  let wrong = ProblemSchema.parse(stampId(correctDraft(raw.wrong as ProblemDraft)));
  // Never re-serve the exact problem he just solved (the "same problem again" bug).
  if (right.prompt === current.prompt)
    right = stampId(localProblem(current.skill, Math.min(0.95, current.difficulty + 0.12)));
  if (wrong.prompt === current.prompt)
    wrong = stampId(localProblem(current.skill, Math.max(0.15, current.difficulty - 0.1)));
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
      // speed 0.7–1.2 (1.0 = default); slower so a 6-year-old can follow.
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.75 },
      }),
    },
  );
  if (!r.ok) return c.json({ error: `tts ${r.status}` }, 502);
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg" } });
});

console.log(`[institute] tutor server on :${PORT} (model ${TUTOR_MODEL})`);
export default { port: PORT, fetch: app.fetch };
