import { describe, expect, test } from 'bun:test';
import { closeLeadsToCamp } from '../src/rpg/dialogClose';

describe('closing a dialog', () => {
  test('returns to the dungeon mid-expedition', () => {
    expect(closeLeadsToCamp({ playing: true, cleared: false, awaitingDescent: false })).toBe(false);
  });
  test('returns to the dungeon while the way down waits after the guardian', () => {
    expect(closeLeadsToCamp({ playing: true, cleared: true, awaitingDescent: true })).toBe(false);
  });
  test('goes to camp when the expedition is cleared and no way down waits', () => {
    expect(closeLeadsToCamp({ playing: true, cleared: true, awaitingDescent: false })).toBe(true);
  });
  test('goes to camp when the hero is not playing', () => {
    expect(closeLeadsToCamp({ playing: false, cleared: false, awaitingDescent: false })).toBe(true);
    expect(closeLeadsToCamp({ playing: false, cleared: true, awaitingDescent: true })).toBe(true);
  });
});
