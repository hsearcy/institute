import { Database } from 'bun:sqlite';
import { expect, spyOn, test } from 'bun:test';
import { rpgDungeonForgeDust } from '@institute/shared';
import { createRpgRoutes, ensureRpgSchema, getRpgState, resolveRpgEncounter, saveRpgState, startRpgExpedition } from './rpg';

function fixture() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER); CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER, created_at INTEGER)');
  ensureRpgSchema(db);
  return db;
}
function finishRoom(db: Database, prefix: string) {
  for (let i = 0; i < 30; i++) {
    const expedition = getRpgState(db, 'sam').expedition!;
    const request = { profileId: 'sam', problemId: `${prefix}-${i}`, expeditionId: expedition.id, encounterIndex: expedition.encounterIndex };
    db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', request.problemId, Date.now());
    const result = resolveRpgEncounter(db, request);
    if (result.reward.combat!.encounterCleared) return { result, request };
  }
  throw new Error('Room did not finish');
}
const post = (db: Database, path: string, body: unknown) => createRpgRoutes(db).request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('rolled drop and guaranteed material receipt survive retries without granting another instance', () => {
  const db = fixture(), random = spyOn(Math, 'random').mockReturnValue(0);
  try {
    startRpgExpedition(db, 'sam');
    const { result, request } = finishRoom(db, 'first');
    expect(result.reward.loot?.itemId).toBe('cinderwand');
    expect(result.reward.loot!.bonusPower).toBeGreaterThan(0);
    expect(result.reward.loot!.bonusTargets).toBe(1);
    expect(result.reward.forgeDust).toBe(3);
    const before = db.query('SELECT state_json FROM rpg_profiles').get() as { state_json: string };
    const solves = db.query('SELECT * FROM daily_solves').all(), attempts = db.query('SELECT * FROM attempts').all();
    random.mockImplementation(() => { throw new Error('A receipt must never reroll loot'); });
    const retry = resolveRpgEncounter(db, request);
    expect(retry.duplicate).toBe(true);
    expect(retry.reward).toEqual(result.reward);
    expect(retry.state.loot).toEqual(result.state.loot);
    expect(retry.state.forgeDust).toBe(3);
    expect(db.query('SELECT state_json FROM rpg_profiles').get()).toEqual(before);
    expect(db.query('SELECT * FROM daily_solves').all()).toEqual(solves);
    expect(db.query('SELECT * FROM attempts').all()).toEqual(attempts);
  } finally { random.mockRestore(); db.close(); }
});

test('repeat item discoveries keep an independently equippable roll after collection completion', () => {
  const db = fixture();
  try {
    const state = getRpgState(db, 'sam');
    state.inventory.push('cinderwand');
    saveRpgState(db, state);
    startRpgExpedition(db, 'sam');
    const { result } = finishRoom(db, 'duplicate');
    expect(result.reward.duplicateItem).toBe(true);
    expect(result.reward.newItems).toEqual([]);
    expect(result.reward.loot!.id).not.toBe('legacy:cinderwand');
    expect(result.state.loot!.filter(item => item.itemId === 'cinderwand')).toHaveLength(2);
    expect(result.state.inventory.filter(id => id === 'cinderwand')).toHaveLength(1);
    expect(getRpgState(db, 'sam').loot).toEqual(result.state.loot);
  } finally { db.close(); }
});

test('each highest-tier clear unlocks one harder tier; old active encounters retain their exact health', () => {
  const db = fixture();
  try {
    expect(() => startRpgExpedition(db, 'sam', 'embercrypt', 2)).toThrow('highest dungeon tier');
    const started = startRpgExpedition(db, 'sam');
    for (let room = 0; room < 6; room++) finishRoom(db, `room-${room}`);
    const cleared = getRpgState(db, 'sam');
    expect(cleared.bestTier).toBe(1);
    expect(cleared.forgeDust).toBe(rpgDungeonForgeDust(1));
    const tier2 = startRpgExpedition(db, 'sam', 'embercrypt', 2);
    expect(tier2.expedition!.tier).toBe(2);
    expect(tier2.expedition!.combat!.enemies[0].maxHp).toBeGreaterThan(started.expedition!.combat!.enemies[0].maxHp);
    expect(tier2.expedition!.combat!.enemies.length).toBeLessThanOrEqual(10);
    // Retrying start mid-run never resets wounds or escalates a room in place.
    expect(startRpgExpedition(db, 'sam', 'embercrypt', 3)).toEqual(tier2);
    delete tier2.expedition!.tier;
    tier2.expedition!.combat!.enemies[0].hp = 4;
    saveRpgState(db, tier2);
    expect(getRpgState(db, 'sam').expedition!.combat!.enemies).toEqual(tier2.expedition!.combat!.enemies);
  } finally { db.close(); }
});

test('instance equipment and pinned goals persist while rejecting foreign IDs and skill-bonus prerequisite bypasses', async () => {
  const db = fixture();
  try {
    const state = getRpgState(db, 'sam');
    state.skillPoints = 4; state.level = 20;
    state.loot!.push({ id: 'rolled', itemId: 'apprentice', bonusPower: 4, upgradeLevel: 1, bonusSkillId: 'ember_power', bonusSkillRanks: 2 });
    saveRpgState(db, state);
    expect((await post(db, '/equip', { profileId: 'sam', lootId: 'rolled' })).status).toBe(200);
    expect(getRpgState(db, 'sam').equippedLootId).toBe('rolled');
    expect((await post(db, '/upgrade', { profileId: 'sam', skillId: 'meteor' })).status).toBe(400);
    expect((await post(db, '/equip', { profileId: 'other', lootId: 'rolled' })).status).toBe(400);
    expect((await post(db, '/equip', { profileId: 'sam', itemId: 'cinderwand', lootId: 'rolled' })).status).toBe(400);
    expect((await post(db, '/goal', { profileId: 'sam', goal: { kind: 'upgrade', id: 'rolled' } })).status).toBe(200);
    expect(getRpgState(db, 'sam').goal).toEqual({ kind: 'upgrade', id: 'rolled' });
    expect((await post(db, '/goal', { profileId: 'other', goal: { kind: 'upgrade', id: 'rolled' } })).status).toBe(400);
    expect((await post(db, '/goal', { profileId: 'sam', goal: null })).status).toBe(200);
    expect(getRpgState(db, 'sam').goal).toBeNull();
    expect((await post(db, '/equip', { profileId: 'sam', itemId: 'apprentice' })).status).toBe(200);
    expect(getRpgState(db, 'sam').equippedLootId).toBe('legacy:apprentice');
  } finally { db.close(); }
});

test('retreat keeps earned rewards and solve claims, grants no clear, and can be repeated safely', async () => {
  const db = fixture();
  try {
    const state = getRpgState(db, 'sam');
    state.bestTier = 2;
    saveRpgState(db, state);
    startRpgExpedition(db, 'sam', 'embercrypt', 3);
    const { result, request } = finishRoom(db, 'retreat-reward');
    const { expedition, ...earned } = result.state;
    expect(result.state.loot!.length).toBeGreaterThan(1);
    expect(result.state.forgeDust).toBeGreaterThan(0);
    const claims = db.query('SELECT * FROM rpg_cast_claims').all();
    const solves = db.query('SELECT * FROM daily_solves').all();
    const attempts = db.query('SELECT * FROM attempts').all();
    const retreated = await post(db, '/retreat', { profileId: 'sam' });
    expect(retreated.status).toBe(200);
    expect(await retreated.json()).toEqual({ ...earned, expedition: null });
    const checkpoint = db.query('SELECT * FROM rpg_profiles').all();
    expect((await post(db, '/retreat', { profileId: 'sam' })).status).toBe(200);
    expect(db.query('SELECT * FROM rpg_profiles').all()).toEqual(checkpoint);
    expect(db.query('SELECT * FROM rpg_cast_claims').all()).toEqual(claims);
    expect(db.query('SELECT * FROM daily_solves').all()).toEqual(solves);
    expect(db.query('SELECT * FROM attempts').all()).toEqual(attempts);
    const retry = resolveRpgEncounter(db, request);
    expect(retry.duplicate).toBe(true);
    expect(retry.reward).toEqual(result.reward);
    expect(retry.state).toEqual({ ...earned, expedition: null });
    const easier = startRpgExpedition(db, 'sam', 'embercrypt', 1);
    expect(easier.expedition!.tier).toBe(1);
    expect(easier.expedition!.id).not.toBe(expedition!.id);
    expect(easier.expeditionsCompleted).toBe(earned.expeditionsCompleted);
    expect(easier.bestTier).toBe(2);
    expect(() => resolveRpgEncounter(db, { ...request, expeditionId: easier.expedition!.id })).toThrow('already powered');
  } finally { db.close(); }
});

test('boss bonus rolls and stronger loot are saved once; ordinary rooms award no bonus money', () => {
  const db = fixture(), random = spyOn(Math, 'random').mockReturnValue(0);
  try {
    startRpgExpedition(db, 'sam');
    for (let room=0; room<5; room++) {
      const {result}=finishRoom(db, `bonus-${room}`);
      expect(result.reward.bossCrazyCoins ?? 0).toBe(0);
      expect(result.reward.bossDimes ?? 0).toBe(0);
      expect(result.reward.loot?.spellShape).toBeUndefined();
    }
    const {result,request}=finishRoom(db,'bonus-boss');
    expect(result.reward.bossCrazyCoins).toBe(1);
    expect(result.reward.bossDimes).toBe(1);
    expect(result.reward.loot!.bonusPower).toBeGreaterThanOrEqual(4);
    random.mockImplementation(()=>{throw Error('A saved reward must not roll again');});
    expect(resolveRpgEncounter(db,request).reward).toEqual(result.reward);
  } finally { random.mockRestore(); db.close(); }
});

test('boss money and item strength use the completed tier, not the highest unlocked tier', () => {
  const random=spyOn(Math,'random').mockReturnValue(.05);
  const powers:number[]=[];
  try {
    for(const tier of [1,10]) {
      const db=fixture();
      try {
        const s=getRpgState(db,'sam');s.bestTier=20;saveRpgState(db,s);
        const started=startRpgExpedition(db,'sam','embercrypt',tier);
        started.expedition!.encounterIndex=5;
        started.expedition!.combat={version:1,encounterIndex:5,casts:0,enemies:[{id:'enemy-0',hp:1,maxHp:1}]};
        saveRpgState(db,started);
        const {result,request}=finishRoom(db,`tier-${tier}`);
        expect(result.reward.bossCrazyCoins).toBe(tier===1?0:1);
        expect(result.reward.bossDimes).toBe(tier===1?0:1);
        expect(result.reward.tier).toBe(tier);
        powers.push(result.reward.loot!.bonusPower);
        const saved=result.reward;random.mockReturnValue(.99);
        expect(resolveRpgEncounter(db,request).reward).toEqual(saved);
        random.mockReturnValue(.05);
      } finally {db.close();}
    }
    expect(powers[1]).toBeGreaterThan(powers[0]);
  } finally {random.mockRestore();}
});

test('room one can be abandoned before a cast and restarted at a lower tier without a clear', async () => {
  const db=fixture();
  try {
    const s=getRpgState(db,'sam');s.bestTier=3;saveRpgState(db,s);
    const before=startRpgExpedition(db,'sam','embercrypt',4);
    expect(before.expedition!.encounterIndex).toBe(0);
    expect((await post(db,'/retreat',{profileId:'sam'})).status).toBe(200);
    const after=startRpgExpedition(db,'sam','mosswood',1);
    expect(after.expedition).toMatchObject({regionId:'mosswood',tier:1,encounterIndex:0});
    expect(after.expedition!.id).not.toBe(before.expedition!.id);
    expect(after.totalKills).toBe(before.totalKills);expect(after.loot).toEqual(before.loot);
    expect(after.expeditionsCompleted).toBe(before.expeditionsCompleted);
  } finally {db.close();}
});
