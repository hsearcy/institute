import {
  TAXONOMY,
  initialSkillState,
  applyOutcome,
  scheduleNextReview,
  eligiblePool,
  type AttemptOutcome,
  type SkillState,
} from "../src/index.ts";

/**
 * A small toy simulation: pretend we're "Sam" practicing for 7 days. Each day,
 * we pick the eligible pool, simulate his performance with a known accuracy,
 * apply outcomes, advance SRS for transitions to mastered, and print state.
 *
 * No randomness in the structure — accuracy is parameterized so the run is
 * reproducible.
 */
const PROFILE_ID = "sam";
const ACCURACY = 0.85;

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function simulate() {
  const random = rng(42);
  let states: SkillState[] = TAXONOMY.map((s) => initialSkillState(PROFILE_ID, s.id));
  const startDay = new Date("2026-04-25T09:00:00Z");

  for (let day = 0; day < 7; day++) {
    const now = new Date(startDay.getTime() + day * 86_400_000);
    const pool = eligiblePool(states, TAXONOMY, now);
    console.log(`\n=== Day ${day + 1} (${now.toISOString().slice(0, 10)}) — pool: [${pool.join(", ")}] ===`);

    for (const skillId of pool) {
      // Practice 4 problems on each pool skill today
      for (let i = 0; i < 4; i++) {
        const correct = random() < ACCURACY;
        const skill = TAXONOMY.find((s) => s.id === skillId)!;
        const difficulty = skill.difficultyBand[0]
          + random() * (skill.difficultyBand[1] - skill.difficultyBand[0]);
        const outcome: AttemptOutcome = {
          correct,
          hinted: false,
          scaffolded: false,
          difficulty,
          occurredAt: now,
        };
        states = states.map((s) => {
          if (s.skillId !== skillId) return s;
          const advanced = applyOutcome(s, outcome, skill.difficultyBand);
          // If state just became mastered, schedule its first review.
          if (s.state !== "mastered" && advanced.state === "mastered") {
            const sched = scheduleNextReview(advanced, outcome, now);
            return {
              ...advanced,
              state: "review",
              srsInterval: sched.srsInterval,
              srsEase: sched.srsEase,
              nextReviewAt: sched.nextReviewAt,
            };
          }
          // For reviews, also advance SRS on every outcome.
          if (s.state === "review") {
            const sched = scheduleNextReview(advanced, outcome, now);
            return {
              ...advanced,
              srsInterval: sched.srsInterval,
              srsEase: sched.srsEase,
              nextReviewAt: sched.nextReviewAt,
            };
          }
          return advanced;
        });
      }

      const after = states.find((s) => s.skillId === skillId)!;
      console.log(`  ${skillId.padEnd(24)} state=${after.state.padEnd(10)} attempts=${after.attempts} correct=${after.correct} dif=${after.currentDifficulty.toFixed(2)}`);
    }
  }

  console.log("\n=== End-of-week summary ===");
  const counts: Record<string, number> = {};
  for (const s of states) counts[s.state] = (counts[s.state] ?? 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
}

simulate();
