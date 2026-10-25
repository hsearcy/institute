import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { RPG_WISDOM_POTION_XP, rpgRoomForgeDust, rpgTraderWares } from '@institute/shared';
import { ensureRpgSchema, getRpgState, openRpgChest, saveRpgState, startRpgExpedition } from './rpg';
import { rememberServed } from './servedProblems';
import { buyFromTrader, createRpgTraderRoutes } from './rpgTrader';
import { ensureRpgEconomySchema } from './rpgEconomy';

function fixture(dust = 44) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE attempts (id INTEGER PRIMARY KEY, profile_id TEXT, problem_id TEXT, correct INTEGER, skipped INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE daily_solves (profile_id TEXT, problem_id TEXT, solved_at INTEGER, PRIMARY KEY (profile_id,problem_id));
    CREATE TABLE profile_state (profile_id TEXT PRIMARY KEY, gems INTEGER);
    INSERT INTO profile_state VALUES ('sam', 500);`);
  ensureRpgSchema(db); ensureRpgEconomySchema(db);
  const state = getRpgState(db, 'sam');
  state.forgeDust = dust; state.inventory.push('cinderwand');
  saveRpgState(db, state);
  return db;
}
const solved = (db: Database, id: string) => db.query('INSERT INTO daily_solves VALUES (?, ?, ?)').run('sam', id, Date.now());
const chest = (db: Database, problemId: string, chestId: string) => openRpgChest(db, { profileId: 'sam', problemId, expeditionId: getRpgState(db, 'sam').expedition!.id, chestId });
const price = (db: Database, id: string) => rpgTraderWares(getRpgState(db, 'sam')).find(ware => ware.id === id)!.price;

describe('chest word problems pay what the story counted', () => {
  test('a served times fact pays its answer as forge dust; a big count pays the usual dust', () => {
    const db = fixture(0);
    startRpgExpedition(db, 'sam');
    rememberServed(db, 'sam', [{ id: 'mul', prompt: '3 × 4', answer: 12 }, { id: 'big', prompt: '34 + 25', answer: 59 }]);
    solved(db, 'mul'); solved(db, 'big');
    const first = chest(db, 'mul', 'c1');
    expect(first.reward).toMatchObject({ forgeDust: 12, counted: { treasure: 'dust', amount: 12 } });
    const second = chest(db, 'big', 'c2');
    expect(second.reward).toMatchObject({ forgeDust: rpgRoomForgeDust(1), counted: { treasure: 'gold', amount: 59 } });
    expect(getRpgState(db, 'sam').forgeDust).toBe(12 + rpgRoomForgeDust(1));
    expect(getRpgState(db, 'sam').expedition!.chestsOpened).toBe(2);
  });

  test('a problem the server never served pays the usual dust, whatever the client shows', () => {
    const db = fixture(0);
    startRpgExpedition(db, 'sam');
    solved(db, 'unknown');
    expect(chest(db, 'unknown', 'c1').reward.forgeDust).toBe(rpgRoomForgeDust(1));
  });

  test('a lucky charm makes the next paying chest hold a relic, once', () => {
    const db = fixture(0);
    const state = getRpgState(db, 'sam'); state.chestCharms = 1; saveRpgState(db, state);
    startRpgExpedition(db, 'sam');
    solved(db, 'a');
    const opened = chest(db, 'a', 'c1');
    expect(opened.reward.charm).toBe(true);
    expect(opened.reward.item).not.toBeNull();
    expect(getRpgState(db, 'sam').chestCharms).toBe(0);
  });
});

describe('the wandering trader takes dust only for the right change', () => {
  test('a wisdom potion: wrong change and stale balances are refused; the right change pays once', () => {
    const db = fixture(44);
    const cost = price(db, 'wisdom-potion');
    const buy = (answer: number, seenDust = 44, requestId = 'r1') => buyFromTrader(db, { profileId: 'sam', requestId, wareId: 'wisdom-potion', seenDust, answer });
    expect(() => buy(44 - cost + 1)).toThrow('Count the change');
    expect(() => buy(50 - cost, 50)).toThrow('changed');
    expect(getRpgState(db, 'sam').forgeDust).toBe(44);
    const result = buy(44 - cost);
    expect(result).toMatchObject({ duplicate: false, forgeDust: 44 - cost, xpGained: RPG_WISDOM_POTION_XP });
    expect(getRpgState(db, 'sam').xp).toBe(RPG_WISDOM_POTION_XP);
    // A lost response retried with the same request replays the receipt.
    const retry = buy(44 - cost);
    expect(retry.duplicate).toBe(true);
    expect(getRpgState(db, 'sam').forgeDust).toBe(44 - cost);
  });

  test('not enough dust is refused', () => {
    const db = fixture(10);
    expect(() => buyFromTrader(db, { profileId: 'sam', requestId: 'r', wareId: 'lucky-charm', seenDust: 10, answer: 10 - price(db, 'lucky-charm') })).toThrow('more forge dust');
  });

  test('a fresh roll adds a new copy and keeps the old one; a charm goes in the pack', () => {
    const db = fixture(100);
    const roll = price(db, 'fresh-roll');
    const before = getRpgState(db, 'sam').loot!.filter(loot => loot.itemId === 'cinderwand').length;
    const result = buyFromTrader(db, { profileId: 'sam', requestId: 'roll', wareId: 'fresh-roll', itemId: 'cinderwand', seenDust: 100, answer: 100 - roll });
    expect(result.state.loot!.filter(loot => loot.itemId === 'cinderwand').length).toBe(before + 1);
    expect(result.state.loot!.some(loot => loot.id === result.lootId)).toBe(true);
    expect(() => buyFromTrader(db, { profileId: 'sam', requestId: 'roll2', wareId: 'fresh-roll', itemId: 'arcfang', seenDust: 100 - roll, answer: 100 - 2 * roll })).toThrow('Find this relic');
    const dust = 100 - roll, charm = price(db, 'lucky-charm');
    buyFromTrader(db, { profileId: 'sam', requestId: 'charm', wareId: 'lucky-charm', seenDust: dust, answer: dust - charm });
    expect(getRpgState(db, 'sam').chestCharms).toBe(1);
  });

  test('the route validates input and reports refusals as readable errors', async () => {
    const db = fixture(44);
    const app = createRpgTraderRoutes(db);
    const post = (body: unknown) => app.request('/trader/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ profileId: 'sam', requestId: 'x', wareId: 'dragon', seenDust: 44, answer: 1 })).status).toBe(400);
    const wrong = await post({ profileId: 'sam', requestId: 'x', wareId: 'wisdom-potion', seenDust: 44, answer: 1 });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toContain('Count the change');
    const ok = await post({ profileId: 'sam', requestId: 'y', wareId: 'wisdom-potion', seenDust: 44, answer: 44 - price(db, 'wisdom-potion') });
    expect(ok.status).toBe(200);
  });
});
