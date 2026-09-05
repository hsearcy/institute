import { describe, expect, test } from 'bun:test';
import { rpgLevel } from '../../shared/src/rpg';
import { nextSpellGoal } from '../src/rpg/nextSpell';
const hero = (xp: number, skills: Record<string, number> = {}, skillPoints = 0) => ({ xp, ...rpgLevel(xp), skills, skillPoints });

describe('personal spell target follows existing progression gates', () => {
  test('a new hero sees an attainable next spell without inventing a cast countdown', () => {
    const goal = nextSpellGoal(hero(0))!;
    expect(goal.spell.id).toBe('frost');
    expect(goal.next?.id).toBe('frost');
    expect(goal.xpRemaining).toBe(90);
    expect(goal.ready).toBe(false);
  });
  test('Meteor points to its missing ancestor before its level gate', () => {
    const prerequisite = nextSpellGoal(hero(90, {}, 1), 'meteor')!;
    expect(prerequisite.next?.id).toBe('ember_power');
    expect(prerequisite.ready).toBe(true);
    const levelGate = nextSpellGoal(hero(90, { ember_power: 1 }), 'meteor')!;
    expect(levelGate.next?.id).toBe('meteor');
    expect(levelGate.xpRemaining).toBe(315); // Level 4 starts at 405 XP.
    expect(nextSpellGoal(hero(405, { ember_power: 1 }, 1), 'meteor')?.ready).toBe(true);
  });
  test('spent points and a respec update the target instead of promising an unavailable unlock', () => {
    expect(nextSpellGoal(hero(405, { ember_power: 1 }), 'meteor')?.xpRemaining).toBe(225);
    expect(nextSpellGoal(hero(405, {}, 3), 'meteor')?.next?.id).toBe('ember_power');
    const learned = nextSpellGoal(hero(405, { ember_power: 1, meteor: 1 }), 'meteor')!;
    expect(learned.learned).toBe(true); expect(learned.next).toBeUndefined(); expect(learned.xpRemaining).toBe(0);
  });
});
