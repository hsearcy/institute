/** Add missing spell bonus examples to a scratch save. Never changes earned rewards. */
import { Database } from 'bun:sqlite';
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { RPG_ITEMS, RPG_SPELL_SHAPES } from '../shared/src/index';
import type { RpgState } from '../shared/src/index';

const path = resolve(process.env.RPG_TEST_DB ?? '/tmp/institute-rpg-playtest.db');
if (!path.startsWith(resolve(tmpdir()) + sep)) throw new Error('Use a scratch database under the temporary directory.');
const profile = process.env.RPG_TEST_PROFILE ?? 'rpg-archmage';
const db = new Database(path, { readwrite: true, create: false });
try {
  const row = db.query('SELECT state_json FROM rpg_profiles WHERE profile_id = ?').get(profile) as {state_json: string} | null;
  if (!row) throw new Error('The scratch profile does not exist.');
  const backup = `${tmpdir()}/spell-bonus-save-${Date.now()}.json`;
  await Bun.write(backup, row.state_json);
  const added = db.transaction(() => {
    const current = db.query('SELECT state_json FROM rpg_profiles WHERE profile_id = ?').get(profile) as {state_json: string};
    const state = JSON.parse(current.state_json) as RpgState;
    state.loot ??= [];
    const names: string[] = [];
    for (const shape of RPG_SPELL_SHAPES) {
      if (state.loot.some(loot => loot.spellShape === shape.id)) continue;
      const item = RPG_ITEMS.find(item => item.school === shape.school && item.rarity === 'epic')
        ?? RPG_ITEMS.find(item => item.school === shape.school)!;
      state.loot.push({id:`local-spell-test:${shape.id}`,itemId:item.id,bonusPower:4,upgradeLevel:0,spellShape:shape.id});
      if (!state.inventory.includes(item.id)) state.inventory.push(item.id);
      names.push(shape.name);
    }
    db.query('UPDATE rpg_profiles SET state_json = ?, updated_at = ? WHERE profile_id = ?').run(JSON.stringify(state),Date.now(),profile);
    return names;
  })();
  console.log(JSON.stringify({profile, added, backup}));
} finally { db.close(); }
