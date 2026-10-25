import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { renderGuardianTrack } from '../src/rpg/guardianTrack';

const expedition = (extra: Record<string, unknown>) => ({ id: 'e', regionId: 'embercrypt', encounterIndex: 0, encountersTotal: 6, cleared: false, startedAt: 0, ...extra });

test('the track counts packs toward waking the guardian, then keeps counting', () => {
  const fresh = renderGuardianTrack(expedition({}), 'The Hollow King');
  assert.equal((fresh.match(/◆/g) ?? []).length, 4);
  assert.match(fresh, /wakes after 4 packs/);
  const two = renderGuardianTrack(expedition({ encounterIndex: 2, packsCleared: 2 }), 'K');
  assert.equal((two.match(/class="complete"/g) ?? []).length, 2);
  const awake = renderGuardianTrack(expedition({ encounterIndex: 3, packsCleared: 7 }), 'K');
  assert.match(awake, /class="awake"/); assert.match(awake, /\+3/); assert.match(awake, /Find the sanctum/);
  assert.match(renderGuardianTrack(expedition({ encounterIndex: 5, packsCleared: 4 }), 'K'), /class="current"[^>]*>♜/);
  // Old saves without a pack count read their room as packs.
  assert.equal((renderGuardianTrack(expedition({ encounterIndex: 3 }), 'K').match(/class="complete"/g) ?? []).length, 3);
});
