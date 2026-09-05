/** Isolated local fixtures. Run with bun --no-env-file scripts/seed-rpg-demo.ts. */
import { Database } from 'bun:sqlite';
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { TOPICS, RPG_ITEMS, rpgLevel } from '../shared/src/index';
import { getRpgState } from '../server/src/rpg';

export async function seedRpgDemo() {
  const path = resolve(process.env.RPG_TEST_DB ?? '/tmp/institute-rpg-playtest.db');
  // This helper must never be pointed at the family deployment's DB, even if a
  // production DB_PATH was inherited by the terminal running it.
  if (!path.startsWith(resolve(tmpdir()) + sep)) throw new Error('RPG_TEST_DB must be a scratch path inside the system temporary directory.');
  process.env.DB_PATH = path;
  process.env.PORT = process.env.RPG_TEST_PORT ?? '8799';
  process.env.ANTHROPIC_API_KEY = 'local-playtest-no-network';
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  process.env.TUTOR_MAX_RETRIES = '0';
  process.env.TUTOR_TIMEOUT_MS = '300';
  delete process.env.ELEVENLABS_API_KEY;
  const { default: server } = await import('../server/src/index');
  const db = new Database(path);
  try {
    db.transaction(() => {
      const roots = TOPICS.filter((topic) => topic.prereqs.length === 0);
      for (const profileId of ['rpg-playtest', 'rpg-veteran']) {
        // Restarting the local server preserves everything played so far.
        if (db.query('SELECT 1 FROM profile_state WHERE profile_id = ?').get(profileId)) continue;
        const now = Date.now();
        db.query(`INSERT INTO profile_state (profile_id,gems,lifetime_gems,streak,best_streak,shields,crazy_coins,equipped_pickaxe,equipped_pad_theme,equipped_gem_style,updated_at)
          VALUES (?, 482, 1800, 4, 21, 2, 3, 'diamond', 'pad_ocean', 'gem_ruby', ?)`).run(profileId, now);
        for (const item of ['diamond', 'pad_ocean', 'gem_ruby']) db.query('INSERT INTO owned_items (profile_id,item_key,durability) VALUES (?, ?, 100)').run(profileId, item);
        for (let i = 0; i < 4; i++) {
          const topic = roots[i]!;
          const mastered = i < 2;
          db.query(`INSERT INTO topic_mastery (profile_id,topic_id,attempts,correct,last_difficulty,state,review_interval_days,review_due_at,updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(profileId, topic.id, mastered ? 20 : 4, mastered ? 19 : 2, mastered ? 0.7 : 0.35,
            mastered ? 'mastered' : 'practicing', mastered ? 2 : null, mastered ? now - 3_600_000 : null, now - 86_400_000);
          db.query('INSERT INTO topic_demos (profile_id,topic_id,seen_at) VALUES (?, ?, ?)').run(profileId, topic.id, now - 7 * 86_400_000);
          for (let j = 0; j < (mastered ? 20 : 4); j++) {
            const correct = mastered ? j !== 0 : j > 1;
            const problemId = `seed-${profileId}-${i}-${j}`;
            const created = now - 86_400_000 - j * 30_000;
            db.query(`INSERT INTO attempts (profile_id,problem_id,skill,topic_id,correct,solve_ms,difficulty,created_at)
              VALUES (?, ?, ?, ?, ?, 5000, 0.5, ?)`).run(profileId, problemId, topic.legacySkill, topic.id, correct ? 1 : 0, created);
            if (correct) db.query(`INSERT INTO daily_solves (profile_id,problem_id,day,solved_at) VALUES (?, ?, ?, ?)`).run(profileId, problemId, new Date(created).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), created);
          }
        }
        if (profileId === 'rpg-veteran') {
          const state = getRpgState(db, profileId);
          state.xp = 2250;
          Object.assign(state, rpgLevel(state.xp));
          state.skills = { ember_power: 1, ember_echo: 1, frost: 1, frost_shards: 1, storm: 1, storm_chain: 1 };
          state.skillPoints = state.level - 1 - Object.values(state.skills).reduce((sum, value) => sum + value, 0);
          state.inventory = RPG_ITEMS.map((item) => item.id);
          state.equippedItemId = 'phoenix';
          state.totalKills = 740;
          state.expeditionsCompleted = 5;
          db.query('INSERT INTO rpg_profiles (profile_id,state_json,updated_at) VALUES (?, ?, ?)').run(profileId, JSON.stringify(state), now);
        }
      }
    })();
  } finally { db.close(); }
  return { server, path };
}

if (import.meta.main) {
  const { path } = await seedRpgDemo();
  console.log(`Local fixtures ready in ${path}: rpg-playtest (existing learning, new hero), rpg-veteran (all regions and spells). Existing fixtures were preserved.`);
}
