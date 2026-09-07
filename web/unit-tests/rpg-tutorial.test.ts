import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { advanceTutorial, RPG_TUTORIAL_PAGES, startTutorial } from '../src/rpg/tutorial';

test('tour can move backward through story and return without finishing or mutating prior state', () => {
  const first = startTutorial();
  assert.deepEqual(advanceTutorial(first, 'back'), first);
  const second = advanceTutorial(first, 'next');
  assert.equal(second.index, 1);
  assert.deepEqual(advanceTutorial(second, 'back'), first);
  assert.deepEqual(first, { index: 0, finished: false });
});

test('only skipping or advancing past the final page finishes; replay starts independently', () => {
  let state = startTutorial();
  for (let index = 0; index < RPG_TUTORIAL_PAGES.length; index++) {
    assert.equal(state.finished, false);
    assert.equal(state.index, index);
    state = advanceTutorial(state, 'next');
  }
  assert.equal(state.finished, true);
  assert.equal(state.index, RPG_TUTORIAL_PAGES.length - 1);
  assert.equal(advanceTutorial(state, 'back'), state);
  const skipped = advanceTutorial(startTutorial(2), 'skip');
  assert.equal(skipped.finished, true);
  assert.equal(advanceTutorial(skipped, 'next'), skipped);
  assert.deepEqual(startTutorial(), { index: 0, finished: false });
});

test('invalid or stale local positions cannot render outside the tour', () => {
  for (const index of [NaN, Infinity, -Infinity, -12]) assert.equal(startTutorial(index).index, 0);
  assert.equal(startTutorial(1.9).index, 1);
  assert.equal(startTutorial(999).index, RPG_TUTORIAL_PAGES.length - 1);
  assert.deepEqual(advanceTutorial({ index: Infinity, finished: false }, 'next'), { index: 1, finished: false });
});
