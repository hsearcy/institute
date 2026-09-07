import { expect, test } from 'bun:test';
import { CelebrationQueue, type CelebrationEvent } from '../src/rpg/Celebrations';

const quest = (id: string): CelebrationEvent => ({ id, kind: 'quest', title: 'Quest complete!', subtitle: `Quest ${id}`, reward: '25 gems' });

test('an acknowledged reward receipt does not replay after retry or queue drain', () => {
  const queue = new CelebrationQueue();
  expect(queue.push(quest('one'))).toBe(true);
  expect(queue.push(quest('one'))).toBe(false);
  expect(queue.take()?.id).toBe('one');
  expect(queue.push(quest('one'))).toBe(false);
  expect(queue.take()).toBeUndefined();
});

test('one answer earning multiple quests combines their rewards and preserves its separate level', () => {
  const queue = new CelebrationQueue();
  queue.push(quest('one')); queue.push(quest('two'));
  queue.push({ id: 'level-3', kind: 'level', title: 'Level up!', subtitle: 'Stronger magic', level: 3, reward: '+1 skill point' });
  const combined = queue.take()!;
  expect(combined.title).toBe('2 quests complete!');
  expect(combined.subtitle).toContain('Quest one');
  expect(combined.subtitle).toContain('Quest two');
  expect(combined.reward).toBe('+50 gems');
  expect(queue.take()?.level).toBe(3);
  expect(queue.take()).toBeUndefined();
});

test('daily board and level milestones retain their order between quest groups', () => {
  const queue = new CelebrationQueue();
  queue.push(quest('first'));
  queue.push({ id: 'board', kind: 'daily-board', title: 'All complete!', subtitle: 'Today’s board' });
  queue.push(quest('weekly'));
  expect(queue.take()?.id).toBe('first');
  expect(queue.take()?.kind).toBe('daily-board');
  expect(queue.take()?.id).toBe('weekly');
});

test('an unusually large restored batch stays readable with at most five quests per card', () => {
  const queue = new CelebrationQueue();
  for (let i = 0; i < 7; i++) queue.push(quest(String(i)));
  expect(queue.take()?.title).toBe('5 quests complete!');
  expect(queue.take()?.title).toBe('2 quests complete!');
  expect(queue.take()).toBeUndefined();
});
