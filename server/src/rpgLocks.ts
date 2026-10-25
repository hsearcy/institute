import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import {
  rpgShrineBoon, rpgBoonActive, RPG_BOON_PROBLEM_SLACK_MS,
  type RpgBoon, type RpgExpedition, type RpgState, type RpgShrineResult, type RpgDoorResult,
} from '@institute/shared';
import { getRpgState, saveRpgState, RpgError } from './rpg';

/**
 * Shrines and sealed doors open with one solved problem each, by the same
 * rules as a chest: the tutor's receipt decides, a skipped problem opens
 * nothing, and one problem pays once. A problem that powered a spell or
 * opened a chest cannot open a lock, nor the reverse.
 */
export function ensureRpgLockSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_lock_claims (
      profile_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      expedition_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, problem_id),
      UNIQUE (profile_id, expedition_id, kind, target_id)
    );
  `);
}

type LockKind = 'shrine' | 'door';
const LABEL: Record<LockKind, { used: string; solve: string }> = {
  shrine: { used: 'This shrine has already given its gift.', solve: 'Finish this problem with your tutor to wake the shrine.' },
  door: { used: 'This door is already open.', solve: 'Finish this problem with your tutor to open the door.' },
};

/** True when a shrine or a door already took this problem. */
export function rpgProblemOpenedLock(db: Database, profileId: string, problemId: string): boolean {
  return !!db.query('SELECT 1 FROM rpg_lock_claims WHERE profile_id = ? AND problem_id = ?').get(profileId, problemId);
}

/** The time a problem holds the boon clock still, so the server and the waiting client agree. */
export function rpgPauseBoon(expedition: RpgExpedition, answerMs = 0): void {
  if (expedition.boon) expedition.boon.pausedMs += Math.max(0, answerMs) + RPG_BOON_PROBLEM_SLACK_MS;
}

/**
 * The boon that covers this cast, if any. The client says whether its own
 * clock still runs; the server only honours that within its own allowance.
 * An expired boon is dropped.
 */
export function rpgBoonForCast(expedition: RpgExpedition, now: number, answerMs: number | undefined, clientActive: boolean): RpgBoon | undefined {
  const boon = expedition.boon;
  if (!boon) return undefined;
  if (!rpgBoonActive(boon, now, answerMs)) { delete expedition.boon; return undefined; }
  return clientActive ? boon : undefined;
}

const LockSchema = z.object({
  profileId: z.string().min(1).max(100), problemId: z.string().min(1).max(200),
  expeditionId: z.string().min(1).max(100), targetId: z.string().min(1).max(100),
});

function claimLock(db: Database, kind: LockKind, input: unknown, open: (expedition: RpgExpedition, targetId: string) => unknown): { state: RpgState; saved: unknown; duplicate: boolean } {
  const body = LockSchema.parse(input);
  const receipt = db.query('SELECT expedition_id, kind, target_id, result_json FROM rpg_lock_claims WHERE profile_id = ? AND problem_id = ?')
    .get(body.profileId, body.problemId) as { expedition_id: string; kind: string; target_id: string; result_json: string } | null;
  const state = getRpgState(db, body.profileId);
  if (receipt) {
    if (receipt.expedition_id !== body.expeditionId || receipt.kind !== kind || receipt.target_id !== body.targetId) throw new RpgError('This problem already opened something else.', 409);
    return { state, saved: JSON.parse(receipt.result_json), duplicate: true };
  }
  const cast = db.query(`SELECT 1 FROM rpg_claims WHERE profile_id = ? AND problem_id = ?
    UNION ALL SELECT 1 FROM rpg_cast_claims WHERE profile_id = ? AND problem_id = ? LIMIT 1`).get(body.profileId, body.problemId, body.profileId, body.problemId);
  if (cast) throw new RpgError('This problem already powered a spell.', 409);
  if (db.query('SELECT 1 FROM rpg_chest_claims WHERE profile_id = ? AND problem_id = ?').get(body.profileId, body.problemId)) {
    throw new RpgError('This problem already opened a chest.', 409);
  }
  const expedition = state.expedition;
  if (!expedition || expedition.cleared || expedition.id !== body.expeditionId) throw new RpgError('Your adventure has moved on. Reload its saved checkpoint.', 409);
  if (db.query('SELECT 1 FROM rpg_lock_claims WHERE profile_id = ? AND expedition_id = ? AND kind = ? AND target_id = ?').get(body.profileId, expedition.id, kind, body.targetId)) {
    throw new RpgError(LABEL[kind].used, 409);
  }
  const solve = db.query('SELECT solved_at FROM daily_solves WHERE profile_id = ? AND problem_id = ?')
    .get(body.profileId, body.problemId) as { solved_at: number } | null;
  const skipped = db.query('SELECT 1 FROM attempts WHERE profile_id = ? AND problem_id = ? AND skipped = 1 LIMIT 1').get(body.profileId, body.problemId);
  if (skipped || !solve || solve.solved_at < expedition.startedAt) throw new RpgError(LABEL[kind].solve);
  const saved = open(expedition, body.targetId);
  db.query(`INSERT INTO rpg_lock_claims (profile_id, problem_id, expedition_id, kind, target_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(body.profileId, body.problemId, expedition.id, kind, body.targetId, JSON.stringify(saved), Date.now());
  saveRpgState(db, state);
  return { state, saved, duplicate: false };
}

/** A shrine's boon replaces any boon still running; its clock starts now. */
export function activateRpgShrine(db: Database, input: unknown): RpgShrineResult {
  return db.transaction(() => {
    const { state, saved, duplicate } = claimLock(db, 'shrine', input, (expedition, shrineId) => {
      const boon: RpgBoon = { id: rpgShrineBoon(shrineId), shrineId, grantedAt: Date.now(), pausedMs: 0 };
      expedition.boon = boon;
      return boon;
    });
    return { state, boon: saved as RpgBoon, duplicate };
  })();
}

/** A sealed door opens; the room behind it holds an ordinary chest. */
export function openRpgDoor(db: Database, input: unknown): RpgDoorResult {
  return db.transaction(() => {
    const { state, duplicate } = claimLock(db, 'door', input, (expedition, doorId) => {
      rpgPauseBoon(expedition);
      return { doorId };
    });
    return { state, doorId: LockSchema.parse(input).targetId, duplicate };
  })();
}
