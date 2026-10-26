import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { RPG_WEAPON_GLOWS, rpgCreateGear, rpgForgeCost, rpgGearReinforceCost, rpgMerchantPrice, RPG_ITEMS, type RpgLootInstance } from '@institute/shared';
import { getRpgState, saveRpgState } from './rpg';
import { createRpgEconomyRoutes, ensureRpgEconomySchema, getRpgCamp, mutateRpgEconomy } from './rpgEconomy';

function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE profile_state (
    profile_id TEXT PRIMARY KEY, gems INTEGER DEFAULT 0, lifetime_gems INTEGER DEFAULT 0,
    crazy_coins INTEGER DEFAULT 0, equipped_pickaxe TEXT DEFAULT 'wooden', streak INTEGER DEFAULT 0
  );
  INSERT INTO profile_state VALUES ('sam',2000,9999,7,'diamond',14);
  CREATE TABLE topic_mastery (profile_id TEXT, topic_id TEXT, state TEXT);
  INSERT INTO topic_mastery VALUES ('sam','fractions','mastered');`);
  ensureRpgEconomySchema(db);
  return db;
}
function readWallet(db: Database) { return db.query('SELECT * FROM profile_state WHERE profile_id = ?').get('sam') as Record<string, unknown>; }
function seedForge(db: Database) {
  const state = getRpgState(db, 'sam');
  state.forgeDust = 100;
  state.inventory.push('cinderwand');
  state.loot = [
    { id: 'starter', itemId: 'apprentice', bonusPower: 0, upgradeLevel: 0 },
    { id: 'first', itemId: 'cinderwand', bonusPower: 3, upgradeLevel: 0 },
    { id: 'second', itemId: 'cinderwand', bonusPower: 1, upgradeLevel: 0 },
  ];
  state.equippedLootId = 'first'; state.equippedItemId = 'cinderwand';
  saveRpgState(db, state);
  return state;
}

describe('RPG merchant and forge preserve legacy progress', () => {
  test('catalogue uses the existing wallet and keeps legendary rewards in dungeons', () => {
    const db = fixture();
    try {
      const camp = getRpgCamp(db, 'sam');
      expect(camp.gems).toBe(2000);
      expect(camp.offers.find(item => item.itemId === 'cinderwand')).toMatchObject({ price: 80, available: true, owned: false });
      expect(camp.offers.find(item => item.itemId === 'moonstaff')).toMatchObject({ available: false, requiredClears: 1 });
      expect(camp.offers.some(item => RPG_ITEMS.find(base => base.id === item.itemId)!.rarity === 'legendary')).toBe(false);
      expect(rpgMerchantPrice(RPG_ITEMS[0]!)).toBeNull();
      expect(getRpgCamp(db, 'new-player').gems).toBe(0);
      expect(db.query('SELECT * FROM profile_state WHERE profile_id = ?').get('new-player')).toBeNull();
    } finally { db.close(); }
  });
  test('buying grants one deterministic base item, preserves lifetime/learning, and retry does not charge twice', () => {
    const db = fixture();
    try {
      const before = readWallet(db);
      const result = mutateRpgEconomy(db, 'sam', 'buy-1', 'buy', 'cinderwand');
      expect(result.gems).toBe(1920);
      expect(result.state.loot!.find(item => item.id === result.lootId)).toMatchObject({ itemId: 'cinderwand', bonusPower: 0, upgradeLevel: 0 });
      expect(result.state.inventory.filter(id => id === 'cinderwand')).toHaveLength(1);
      const retry = mutateRpgEconomy(db, 'sam', 'buy-1', 'buy', 'cinderwand');
      expect(retry).toMatchObject({ gems: 1920, duplicate: true, lootId: result.lootId });
      expect(readWallet(db)).toEqual({ ...before, gems: 1920 });
      expect(db.query('SELECT * FROM topic_mastery').all()).toEqual([{ profile_id: 'sam', topic_id: 'fractions', state: 'mastered' }]);
      expect(() => mutateRpgEconomy(db, 'sam', 'buy-1', 'buy', 'glacier')).toThrow('different');
      expect(() => mutateRpgEconomy(db, 'sam', 'buy-2', 'buy', 'cinderwand')).toThrow('already own');
      expect(readWallet(db).gems).toBe(1920);
    } finally { db.close(); }
  });
  test('unknown, legendary, locked and unaffordable purchases leave wallet and save untouched', () => {
    const db = fixture();
    try {
      for (const id of ['missing', 'phoenix', 'apprentice', 'moonstaff']) {
        expect(() => mutateRpgEconomy(db, 'sam', id, 'buy', id)).toThrow();
      }
      db.query('UPDATE profile_state SET gems = 79 WHERE profile_id = ?').run('sam');
      expect(() => mutateRpgEconomy(db, 'sam', 'poor', 'buy', 'cinderwand')).toThrow('80 gems');
      expect(() => mutateRpgEconomy(db, 'new-player', 'poor', 'buy', 'cinderwand')).toThrow('80 gems');
      expect(readWallet(db).gems).toBe(79);
      expect(db.query('SELECT * FROM rpg_profiles').all()).toHaveLength(0);
      expect(db.query('SELECT * FROM rpg_economy_receipts').all()).toHaveLength(0);
    } finally { db.close(); }
  });
  test('a failed save rolls the wallet debit back and leaves its request available for retry', () => {
    const db = fixture();
    try {
      db.exec(`CREATE TRIGGER fail_save BEFORE INSERT ON rpg_profiles BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END;`);
      expect(() => mutateRpgEconomy(db, 'sam', 'retry-after-failure', 'buy', 'cinderwand')).toThrow('storage unavailable');
      expect(readWallet(db).gems).toBe(2000);
      expect(db.query('SELECT * FROM rpg_economy_receipts').all()).toHaveLength(0);
      db.exec('DROP TRIGGER fail_save');
      expect(mutateRpgEconomy(db, 'sam', 'retry-after-failure', 'buy', 'cinderwand').gems).toBe(1920);
    } finally { db.close(); }
  });
  test('upgrades charge gems and dust once, keep the roll, cap at five, and return current state on old retry', () => {
    const db = fixture();
    try {
      seedForge(db);
      const first = mutateRpgEconomy(db, 'sam', 'forge-1', 'upgrade', 'first');
      expect(first).toMatchObject({ gems: 1975, forgeDust: 95, duplicate: false });
      expect(first.state.loot!.find(item => item.id === 'first')).toMatchObject({ bonusPower: 3, upgradeLevel: 1 });
      expect(mutateRpgEconomy(db, 'sam', 'forge-1', 'upgrade', 'first')).toMatchObject({ gems: 1975, forgeDust: 95, duplicate: true });
      for (let level = 2; level <= 5; level++) mutateRpgEconomy(db, 'sam', `forge-${level}`, 'upgrade', 'first');
      expect(getRpgState(db, 'sam').loot!.find(item => item.id === 'first')!.upgradeLevel).toBe(5);
      const wallet = readWallet(db);
      expect(() => mutateRpgEconomy(db, 'sam', 'over-cap', 'upgrade', 'first')).toThrow('maximum');
      expect(readWallet(db)).toEqual(wallet);
      const late = mutateRpgEconomy(db, 'sam', 'forge-1', 'upgrade', 'first');
      expect(late.state.loot!.find(item => item.id === 'first')!.upgradeLevel).toBe(5);
      expect(late.gems).toBe(1625);
    } finally { db.close(); }
  });
  test('insufficient dust or gems never partially upgrades the item', () => {
    const db = fixture();
    try {
      const state = seedForge(db); state.forgeDust = 0; saveRpgState(db, state);
      expect(() => mutateRpgEconomy(db, 'sam', 'dust', 'upgrade', 'first')).toThrow('forge dust');
      expect(readWallet(db).gems).toBe(2000);
      state.forgeDust = 100; saveRpgState(db, state);
      db.query('UPDATE profile_state SET gems = 1 WHERE profile_id = ?').run('sam');
      expect(() => mutateRpgEconomy(db, 'sam', 'gems', 'upgrade', 'first')).toThrow('25 gems');
      expect(getRpgState(db, 'sam').forgeDust).toBe(100);
      expect(getRpgState(db, 'sam').loot!.find(item => item.id === 'first')!.upgradeLevel).toBe(0);
      expect(rpgForgeCost(state.loot![1]!)).toEqual({ gems: 25, dust: 5 });
    } finally { db.close(); }
  });
  test('forging and receipt replay preserve every specialized roll and learning progress', () => {
    const affixes: Partial<RpgLootInstance>[] = [
      { bonusTargets: 2 }, { bonusSpellId: 'ember', bonusSpellPower: 6 }, { bonusSchoolId: 'ember', bonusSchoolPower: 4 },
    ];
    for (const affix of affixes) {
      const db = fixture();
      try {
        const state = seedForge(db), item = state.loot!.find(item => item.id === 'first')!;
        Object.assign(item, affix); saveRpgState(db, state);
        const original = structuredClone(item), learning = db.query('SELECT * FROM topic_mastery').all();
        const result = mutateRpgEconomy(db, 'sam', 'affix-forge', 'upgrade', 'first');
        expect(result.state.loot!.find(item => item.id === 'first')).toEqual({ ...original, upgradeLevel: 1 });
        const retry = mutateRpgEconomy(db, 'sam', 'affix-forge', 'upgrade', 'first');
        expect(retry.duplicate).toBe(true); expect(retry.gems).toBe(result.gems); expect(retry.forgeDust).toBe(result.forgeDust);
        expect(getRpgState(db, 'sam').loot!.find(item => item.id === 'first')).toEqual({ ...original, upgradeLevel: 1 });
        expect(db.query('SELECT * FROM topic_mastery').all()).toEqual(learning);
        expect(getRpgState(db, 'sam').skills).toEqual(state.skills);
      } finally { db.close(); }
    }
  });
  test('salvaging is retry-safe, protects equipped and final copies, and cannot recreate salvageable legacy loot', () => {
    const db = fixture();
    try {
      const state = seedForge(db);
      state.goal = { kind: 'upgrade', id: 'second' }; saveRpgState(db, state);
      expect(() => mutateRpgEconomy(db, 'sam', 'equipped', 'salvage', 'first')).toThrow('Equip another');
      expect(() => mutateRpgEconomy(db, 'sam', 'only', 'salvage', 'starter')).toThrow('Keep one');
      const result = mutateRpgEconomy(db, 'sam', 'salvage-second', 'salvage', 'second');
      expect(result).toMatchObject({ gems: 2000, forgeDust: 106, dustGained: 6, duplicate: false });
      expect(result.state.loot!.some(item => item.id === 'second')).toBe(false);
      expect(result.state.inventory).toContain('cinderwand');
      expect(result.state.goal).toBeNull();
      expect(mutateRpgEconomy(db, 'sam', 'salvage-second', 'salvage', 'second')).toMatchObject({ forgeDust: 106, duplicate: true });
      expect(getRpgState(db, 'sam').loot!.filter(item => item.itemId === 'cinderwand')).toHaveLength(1);
      expect(() => mutateRpgEconomy(db, 'sam', 'salvage-second', 'upgrade', 'second')).toThrow('different');
    } finally { db.close(); }
  });
  test('HTTP mutations require request IDs and reject malformed payloads', async () => {
    const db = fixture();
    try {
      const routes = createRpgEconomyRoutes(db);
      for (const [path, body] of [
        ['/shop/buy', { profileId: 'sam', itemId: 'cinderwand' }],
        ['/forge/upgrade', { profileId: 'sam', lootId: 'starter', requestId: '' }],
        ['/forge/salvage', { profileId: 'sam', requestId: 'bad' }],
      ] as const) {
        const response = await routes.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        expect(response.status).toBe(400);
      }
      expect((await routes.request('/camp?profileId=sam')).status).toBe(200);
      expect(readWallet(db).gems).toBe(2000);
    } finally { db.close(); }
  });
  test('reinforcing gear charges gems and dust once, grows every stat, and stops at five', () => {
    const db = fixture();
    try {
      const state = getRpgState(db, 'sam');
      const plate = { ...rpgCreateGear('scale_mail', 3, () => .5, 'epic'), id: 'plate' };
      state.gear = [plate]; state.forgeDust = 200;
      saveRpgState(db, state);
      const cost = rpgGearReinforceCost(plate);
      const first = mutateRpgEconomy(db, 'sam', 'r1', 'reinforce', 'plate');
      const grown = first.state.gear!.find(piece => piece.id === 'plate')!;
      expect(grown.reinforce).toBe(1);
      for (const [stat, value] of Object.entries(plate.stats)) expect(grown.stats[stat as keyof typeof grown.stats]!).toBeGreaterThan(value);
      expect(first.gems).toBe(2000 - cost.gems); expect(first.forgeDust).toBe(200 - cost.dust);
      const again = mutateRpgEconomy(db, 'sam', 'r1', 'reinforce', 'plate');
      expect(again.duplicate).toBe(true); expect(again.gems).toBe(2000 - cost.gems);
      for (let n = 2; n <= 5; n++) mutateRpgEconomy(db, 'sam', `r${n}`, 'reinforce', 'plate');
      expect(getRpgState(db, 'sam').gear![0]!.reinforce).toBe(5);
      expect(() => mutateRpgEconomy(db, 'sam', 'r6', 'reinforce', 'plate')).toThrow('fully reinforced');
      expect(() => mutateRpgEconomy(db, 'sam', 'r7', 'reinforce', 'gone')).toThrow('no longer in your bag');
    } finally { db.close(); }
  });

  test('reinforcing without enough dust or gems changes nothing', () => {
    const db = fixture();
    try {
      const state = getRpgState(db, 'sam');
      state.gear = [{ ...rpgCreateGear('leather_cap', 1, () => .5, 'common'), id: 'cap' }]; state.forgeDust = 1;
      saveRpgState(db, state);
      expect(() => mutateRpgEconomy(db, 'sam', 'd1', 'reinforce', 'cap')).toThrow('forge dust');
      db.query('UPDATE profile_state SET gems = 3').run();
      const rich = getRpgState(db, 'sam'); rich.forgeDust = 500; saveRpgState(db, rich);
      expect(() => mutateRpgEconomy(db, 'sam', 'd2', 'reinforce', 'cap')).toThrow('gems');
      expect(getRpgState(db, 'sam').gear![0]!.reinforce ?? 0).toBe(0);
      expect(getRpgState(db, 'sam').forgeDust).toBe(500); expect(readWallet(db).gems).toBe(3);
    } finally { db.close(); }
  });
  test('glows climb in price, buy once, go straight on the weapon, and can be swapped or taken off', async () => {
    const db = fixture();
    try {
      const prices = RPG_WEAPON_GLOWS.map(glow => glow.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      const bought = mutateRpgEconomy(db, 'sam', 'g1', 'glow', 'ember');
      expect(bought.state.glows).toEqual(['ember']); expect(bought.state.glow).toBe('ember'); expect(bought.gems).toBe(2000 - 60);
      expect(mutateRpgEconomy(db, 'sam', 'g1', 'glow', 'ember').duplicate).toBe(true);
      expect(readWallet(db).gems).toBe(2000 - 60);
      expect(() => mutateRpgEconomy(db, 'sam', 'g2', 'glow', 'ember')).toThrow('own this glow');
      expect(() => mutateRpgEconomy(db, 'sam', 'g3', 'glow', 'prism')).toThrow('expeditions');
      expect(() => mutateRpgEconomy(db, 'sam', 'g4', 'glow', 'nope')).toThrow('does not sell');
      db.query('UPDATE profile_state SET gems = 10').run();
      expect(() => mutateRpgEconomy(db, 'sam', 'g5', 'glow', 'frost')).toThrow('80 more gems');
      const routes = createRpgEconomyRoutes(db);
      const wear = (glowId: string | null) => routes.request('/glow/wear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'sam', glowId }) });
      expect((await wear('frost')).status).toBe(400);
      expect(((await (await wear(null)).json()) as { glow: string | null }).glow).toBeNull();
      expect(((await (await wear('ember')).json()) as { glow: string | null }).glow).toBe('ember');
    } finally { db.close(); }
  });
});
