import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  RPG_TRADER_WARE_IDS, RPG_WISDOM_POTION_XP, rpgTraderWares, rpgTraderBlocked, rpgTraderQuestion,
  rpgCreateLoot, rpgLevel, rpgNormalizeLoot, rpgTier, type RpgState, type RpgTraderResult, type RpgTraderWareId,
} from '@institute/shared';
import { getRpgState, saveRpgState } from './rpg';
import { ensureRpgEconomySchema } from './rpgEconomy';

class TraderError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) { super(message); }
}

type Details = Pick<RpgTraderResult, 'wareId' | 'xpGained' | 'levelsGained' | 'lootId'>;

/**
 * The child pays by working out the change. The server checks his answer
 * against the balance he was shown AND the balance it holds, then debits the
 * dust, applies the ware and writes a receipt in one transaction. A retry with
 * the same request ID replays the receipt; it never charges twice.
 */
export function buyFromTrader(db: Database, input: {
  profileId: string; requestId: string; wareId: RpgTraderWareId; itemId?: string; seenDust: number; answer: number;
}): RpgTraderResult {
  return db.transaction(() => {
    const state = rpgNormalizeLoot(getRpgState(db, input.profileId));
    const target = `${input.wareId}:${input.itemId ?? ''}`;
    const receipt = db.query('SELECT action,target_id,result_json FROM rpg_economy_receipts WHERE profile_id = ? AND request_id = ?')
      .get(input.profileId, input.requestId) as { action: string; target_id: string; result_json: string } | null;
    if (receipt) {
      if (receipt.action !== 'trader' || receipt.target_id !== target) throw new TraderError('This request already completed a different trade.', 409);
      return { ...(JSON.parse(receipt.result_json) as Details), state, forgeDust: state.forgeDust ?? 0, duplicate: true };
    }
    const dust = state.forgeDust ?? 0;
    if (input.seenDust !== dust) throw new TraderError('Your forge dust changed. Count again with your new amount.', 409);
    const blocked = rpgTraderBlocked(state, input.wareId, input.itemId);
    if (blocked) throw new TraderError(blocked);
    const ware = rpgTraderWares(state).find(entry => entry.id === input.wareId)!;
    if (input.answer !== rpgTraderQuestion(dust, ware).answer) throw new TraderError('Count the change once more before you pay.');
    state.forgeDust = dust - ware.price;
    const details = applyWare(state, input.wareId, input.itemId);
    saveRpgState(db, state);
    db.query('INSERT INTO rpg_economy_receipts (profile_id,request_id,action,target_id,result_json,created_at) VALUES (?,?,?,?,?,?)')
      .run(input.profileId, input.requestId, 'trader', target, JSON.stringify(details), Date.now());
    return { ...details, state, forgeDust: state.forgeDust, duplicate: false };
  })();
}

function applyWare(state: RpgState, wareId: RpgTraderWareId, itemId?: string): Details {
  if (wareId === 'wisdom-potion') {
    const oldLevel = state.level;
    state.xp += RPG_WISDOM_POTION_XP;
    Object.assign(state, rpgLevel(state.xp));
    const levelsGained = state.level - oldLevel;
    state.skillPoints += levelsGained;
    return { wareId, xpGained: RPG_WISDOM_POTION_XP, levelsGained };
  }
  if (wareId === 'lucky-charm') {
    state.chestCharms = (state.chestCharms ?? 0) + 1;
    return { wareId };
  }
  // A fresh, ordinary (non-guardian) roll at the deepest tier he has cleared.
  const loot = rpgCreateLoot(itemId!, rpgTier(Math.max(1, state.bestTier ?? 1)), Math.random);
  state.loot!.push(loot);
  return { wareId, lootId: loot.id };
}

const BuySchema = z.object({
  profileId: z.string().min(1).max(100), requestId: z.string().min(1).max(100),
  wareId: z.enum(RPG_TRADER_WARE_IDS), itemId: z.string().min(1).max(100).optional(),
  seenDust: z.number().int().min(0), answer: z.number().int(),
});

export function createRpgTraderRoutes(db: Database): Hono {
  ensureRpgEconomySchema(db);
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid trade request.' }, 400);
    if (error instanceof TraderError) return c.json({ error: error.message }, error.status);
    console.error('[rpg-trader]', error);
    return c.json({ error: 'Your trade could not be saved. Please try again.' }, 500);
  });
  app.post('/trader/buy', async c => c.json(buyFromTrader(db, BuySchema.parse(await c.req.json()))));
  return app;
}
