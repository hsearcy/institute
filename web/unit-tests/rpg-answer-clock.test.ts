import { expect, test } from 'bun:test';
import { AnswerClock } from '../src/rpg/AnswerClock';

test('power time starts after reading, excludes pauses, and resumes without resetting', () => {
  let now = 0;
  const clock = new AnswerClock(() => now);
  now = 8000; expect(clock.elapsed()).toBe(0);
  clock.start(); now += 4500; expect(clock.elapsed()).toBe(4500);
  clock.stop(); now += 20000; expect(clock.elapsed()).toBe(4500);
  clock.start(); clock.start(); now += 600;
  expect(clock.elapsed()).toBe(5100);
  clock.stop(); clock.stop(); expect(clock.elapsed()).toBe(5100);
});

test('saved thinking time survives reload and new questions reset independently', () => {
  let now = 100;
  const before = new AnswerClock(() => now); before.start(); now += 17000;
  const after = new AnswerClock(() => now); after.restore(before.elapsed());
  now += 30000; expect(after.elapsed()).toBe(17000);
  after.start(); now += 2000; expect(after.elapsed()).toBe(19000);
  after.restore(0); expect(after.elapsed()).toBe(0);
});
