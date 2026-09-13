import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { enemyRoster } from '../src/rpg/world/enemyRoster';

test('Enemy presentation preserves the supplied count and established boss/guardian roles', () => {
  for (let room = 0; room < 6; room++) for (const count of [0, 1, 2, 7, 24, 30, 36, 48, 96, 120]) {
    const roster = enemyRoster(room, count);
    assert.equal(roster.length, count, 'Presentation must never add or remove authoritative enemies');
    assert.equal(roster.filter(enemy => enemy.boss).length, room === 5 && count > 0 ? 1 : 0);
    for (const [index, enemy] of roster.entries()) {
      assert(['vault-guardian-boss', 'guardian', 'revenant', 'skeleton', 'wraith'].includes(enemy.modelId));
      assert(Number.isFinite(enemy.height) && enemy.height > 0);
      assert.equal(enemy.brute, index % 7 === 0, 'Established guardian slots must retain their large actor behavior');
      assert.equal(enemy.boss, room === 5 && index === 0);
      if (enemy.brute) {
        assert.equal(enemy.modelId, enemy.boss ? 'vault-guardian-boss' : 'guardian');
        assert.equal(enemy.height, enemy.boss ? 3.8 : 2.5);
      } else if (enemy.modelId === 'revenant') {
        assert(enemy.height >= 1.8 && enemy.height <= 1.95, 'Armored soldiers must retain the agreed silhouette scale');
      } else if (enemy.modelId === 'wraith') {
        assert(enemy.height >= 1.8 && enemy.height <= 1.95, 'Crowned wraiths must remain readable beside armored soldiers');
      } else assert.equal(enemy.height, 1.65);
    }
  }
});

test('Normal packs mix armored soldiers with lean bones and spectral accents without armor clumps', () => {
  for (let room = 0; room < 6; room++) for (const count of [24, 30, 36, 40, 96]) {
    const roster = enemyRoster(room, count), ordinary = roster.filter(enemy => !enemy.brute);
    const armored = ordinary.filter(enemy => enemy.modelId === 'revenant');
    assert(armored.length / ordinary.length >= .3 && armored.length / ordinary.length <= .4, `Room${room}:30–40% of ordinary enemies should be armored`);
    assert(roster.some(enemy => enemy.modelId === 'skeleton'), 'Lean bone silhouettes must remain');
    assert(roster.some(enemy => enemy.modelId === 'wraith'), 'Spectral accents must remain');
    assert(new Set(armored.map(enemy => enemy.height)).size >= 3, 'Knights should vary in stature');
    let consecutive = 0;
    for (const enemy of ordinary) {
      consecutive = enemy.modelId === 'revenant' ? consecutive + 1 : 0;
      assert(consecutive <= 2, 'Do not group all armored enemies into adjacent formation slots');
    }
  }
});

test('Roster retries and count upgrades preserve deterministic prefixes while rooms vary', () => {
  const variations = new Set<string>();
  for (let room = 0; room < 6; room++) {
    const full = enemyRoster(room, 96);
    for (const count of [0, 1, 6, 24, 36, 72, 96]) assert.deepEqual(enemyRoster(room, count), full.slice(0, count));
    enemyRoster((room + 1) % 6, 36);
    assert.deepEqual(enemyRoster(room, 96), full, 'Other encounters cannot alter this room’s presentation');
    variations.add(enemyRoster(room, 30).map(enemy => enemy.modelId).join(','));
  }
  assert.equal(variations.size, 6, 'Each room should vary the placement of its ordinary silhouettes');
  for (const count of [-1, NaN, Infinity]) assert.deepEqual(enemyRoster(0, count), []);
  assert.equal(enemyRoster(0, 3.9).length, 3);
});
