import { RPG_BOONS, rpgShrineBoon, type RpgBoonId } from '@institute/shared';
import type { LockTarget } from './DungeonWorld';

/** Child-facing words for a lock's answer panel. They invite; they never rate the problem. */
export function lockLabels(lock: LockTarget): { title: string; button: string; color?: string } {
  if (lock.kind === 'shrine') {
    const boon = RPG_BOONS[rpgShrineBoon(lock.id)];
    return { title: `Wake the shrine of ${boon.name}`, button: 'Wake', color: boon.color };
  }
  if (lock.kind === 'door') return { title: 'Open the sealed door', button: 'Open' };
  return { title: 'Unlock the chest', button: 'Unlock' };
}

/** The toast once a lock opens. */
export function finishLockText(lock: LockTarget, boon?: RpgBoonId): string {
  if (lock.kind === 'shrine' && boon) return `${RPG_BOONS[boon].name}! ${RPG_BOONS[boon].blurb}.`;
  if (lock.kind === 'door') return 'The door opens! Something waits inside.';
  return 'Unlocked!';
}

/** Four shrines in ten are a trap: waking one calls the waiting pack up around it. Fixed by id, so a reload agrees. */
export function shrineAmbush(id: string): boolean {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % 10 < 4;
}
