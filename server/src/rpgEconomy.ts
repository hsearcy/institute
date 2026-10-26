import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  RPG_ITEMS, RPG_MAX_ITEM_UPGRADE, rpgCampOffers, rpgMerchantPrice, rpgSalvageValue,
  rpgForgeCost, rpgGearReinforceCost, rpgGearReinforceLevel, rpgNormalizeLoot, rpgReinforceGear, RPG_MAX_GEAR_REINFORCE, type RpgCampState, type RpgEconomyResult, type RpgState,
} from '@institute/shared';
import { ensureRpgSchema, getRpgState, saveRpgState } from './rpg';

export function ensureRpgEconomySchema(db: Database): void {
  ensureRpgSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS rpg_economy_receipts (
    profile_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, request_id)
  )`);
}

class EconomyError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) { super(message); }
}

function gems(db: Database, profileId: string): number {
  const row = db.query('SELECT gems FROM profile_state WHERE profile_id = ?').get(profileId) as { gems: number | null } | null;
  return row?.gems ?? 0;
}

function debit(db: Database, profileId: string, cost: number): void {
  // Spend the original wallet. Never subtract from lifetime earnings, create a
  // second currency balance, or rewrite unrelated reward/learning fields.
  const result = db.query('UPDATE profile_state SET gems = gems - ? WHERE profile_id = ? AND gems >= ?')
    .run(cost, profileId, cost);
  if (result.changes !== 1) throw new EconomyError(`You need ${cost} gems for this.`);
}

export function getRpgCamp(db: Database, profileId: string): RpgCampState {
  const state = rpgNormalizeLoot(getRpgState(db, profileId));
  return { gems: gems(db, profileId), forgeDust: state.forgeDust ?? 0, offers: rpgCampOffers(state) };
}

type ReceiptDetails = Pick<RpgEconomyResult, 'lootId' | 'gearId' | 'dustGained'>;
type EconomyAction = 'buy' | 'upgrade' | 'salvage' | 'reinforce';

/** Receipt, wallet debit and adventure save commit together. A retry returns
 * today's state with the original operation details; a reused ID for a different
 * operation is rejected even when its target is the same. */
export function mutateRpgEconomy(db: Database, profileId: string, requestId: string,
  action: EconomyAction, targetId: string): RpgEconomyResult {
  return db.transaction(() => {
    const state = rpgNormalizeLoot(getRpgState(db, profileId));
    const receipt = db.query('SELECT action,target_id,result_json FROM rpg_economy_receipts WHERE profile_id = ? AND request_id = ?')
      .get(profileId, requestId) as { action: string; target_id: string; result_json: string } | null;
    if (receipt) {
      if (receipt.action !== action || receipt.target_id !== targetId) throw new EconomyError('This request already completed a different purchase or forge action.', 409);
      return { ...JSON.parse(receipt.result_json), state, gems: gems(db, profileId), forgeDust: state.forgeDust ?? 0, duplicate: true };
    }
    const details = applyOperation(db, state, action, targetId);
    saveRpgState(db, state);
    db.query('INSERT INTO rpg_economy_receipts (profile_id,request_id,action,target_id,result_json,created_at) VALUES (?,?,?,?,?,?)')
      .run(profileId, requestId, action, targetId, JSON.stringify(details), Date.now());
    return { ...details, state, gems: gems(db, profileId), forgeDust: state.forgeDust ?? 0, duplicate: false };
  })();
}

function applyOperation(db: Database, state: RpgState, action: EconomyAction, targetId: string): ReceiptDetails {
  if (action === 'buy') {
    const item = RPG_ITEMS.find(item => item.id === targetId);
    const price = item ? rpgMerchantPrice(item) : null;
    if (!item || price === null) throw new EconomyError('This item is found in dungeons, not sold here.');
    if (state.inventory.includes(item.id)) throw new EconomyError('You already own this item. Find bonus versions in dungeons.');
    if (state.expeditionsCompleted < item.requiredClears) throw new EconomyError(`Finish ${item.requiredClears} expeditions to unlock this item.`);
    debit(db, state.profileId, price);
    const loot = { id: crypto.randomUUID(), itemId: item.id, bonusPower: 0, upgradeLevel: 0 };
    state.loot!.push(loot);
    state.inventory.push(item.id);
    return { lootId: loot.id };
  }
  if (action === 'reinforce') {
    const piece = state.gear?.find(entry => entry.id === targetId);
    if (!piece) throw new EconomyError('That gear is no longer in your bag.');
    if (rpgGearReinforceLevel(piece) >= RPG_MAX_GEAR_REINFORCE) throw new EconomyError('This piece is fully reinforced.');
    const cost = rpgGearReinforceCost(piece);
    if ((state.forgeDust ?? 0) < cost.dust) throw new EconomyError(`You need ${cost.dust} forge dust for this.`);
    debit(db, state.profileId, cost.gems);
    state.forgeDust = (state.forgeDust ?? 0) - cost.dust;
    rpgReinforceGear(piece);
    return { gearId: piece.id };
  }
  const loot = state.loot!.find(entry => entry.id === targetId);
  if (!loot) throw new EconomyError('That item is no longer in your backpack.');
  if (action === 'upgrade') {
    if (loot.upgradeLevel >= RPG_MAX_ITEM_UPGRADE) throw new EconomyError('This item has reached its maximum forge level.');
    const cost = rpgForgeCost(loot);
    if ((state.forgeDust ?? 0) < cost.dust) throw new EconomyError(`You need ${cost.dust} forge dust for this upgrade.`);
    debit(db, state.profileId, cost.gems);
    state.forgeDust = (state.forgeDust ?? 0) - cost.dust;
    loot.upgradeLevel++;
    return { lootId: loot.id };
  }
  if (state.equippedLootId === loot.id) throw new EconomyError('Equip another item before salvaging this one.');
  if (state.loot!.filter(entry => entry.itemId === loot.itemId).length < 2) throw new EconomyError('Keep one copy of each item in your collection.');
  const dustGained = rpgSalvageValue(loot);
  state.loot = state.loot!.filter(entry => entry.id !== loot.id);
  if (state.goal?.kind === 'upgrade' && state.goal.id === loot.id) state.goal = null;
  state.forgeDust = (state.forgeDust ?? 0) + dustGained;
  return { lootId: loot.id, dustGained };
}

const Profile = z.object({ profileId: z.string().min(1).max(100) });
const Mutation = Profile.extend({ requestId: z.string().min(1).max(100) });
export function createRpgEconomyRoutes(db: Database): Hono {
  ensureRpgEconomySchema(db);
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid camp request.' }, 400);
    if (error instanceof EconomyError) return c.json({ error: error.message }, error.status);
    console.error('[rpg-economy]', error);
    return c.json({ error: 'Your purchase could not be saved. Please try again.' }, 500);
  });
  app.get('/camp', c => {
    const { profileId } = Profile.parse({ profileId: c.req.query('profileId') });
    return c.json(getRpgCamp(db, profileId));
  });
  app.post('/shop/buy', async c => {
    const body = Mutation.extend({ itemId: z.string().min(1).max(100) }).parse(await c.req.json());
    return c.json(mutateRpgEconomy(db, body.profileId, body.requestId, 'buy', body.itemId));
  });
  app.post('/forge/reinforce', async c => {
    const body = Mutation.extend({ gearId: z.string().min(1).max(100) }).parse(await c.req.json());
    return c.json(mutateRpgEconomy(db, body.profileId, body.requestId, 'reinforce', body.gearId));
  });
  for (const action of ['upgrade', 'salvage'] as const) app.post(`/forge/${action}`, async c => {
    const body = Mutation.extend({ lootId: z.string().min(1).max(200) }).parse(await c.req.json());
    return c.json(mutateRpgEconomy(db, body.profileId, body.requestId, action, body.lootId));
  });
  return app;
}
