import { expect, test } from 'bun:test';
import { buildVoyage, chainOf, voyageStatus } from '../src/rpg/masteryMapModel';
import type { MasteryTopic } from '../src/rpg/tutor';

const topic = (id: string, domain: string, prereqs: string[], state: MasteryTopic['state'], unlocked = true): MasteryTopic => ({
  id, name: id, kidLabel: id, domain, prereqs, unlocked, attempts: 0, correct: 0, state, fluentMs: null, assessmentPrompt: '', skips: 0, reviewDueAt: null, reviewIntervalDays: null,
} as MasteryTopic);

const topics = [
  topic('times', 'Multiplication & Division', ['add'], 'unstarted', false),
  topic('add', 'Addition & Subtraction', ['count'], 'practicing'),
  topic('count', 'Counting & Cardinality', [], 'mastered'),
  topic('skip', 'Counting & Cardinality', ['count'], 'mastered'),
  topic('mystery', 'Zoology', ['times'], 'unstarted', false),
];

test('voyage status separates locked, ready, practicing and mastered skills', () => {
  expect(voyageStatus(topic('a', 'd', [], 'mastered'))).toBe('mastered');
  expect(voyageStatus(topic('a', 'd', [], 'unstarted'))).toBe('ready');
  expect(voyageStatus(topic('a', 'd', [], 'mastered', false))).toBe('locked');
});

test('islands follow the route, and unknown domains sail last', () => {
  const voyage = buildVoyage(topics);
  expect(voyage.islands.map(island => island.name)).toEqual(['Counting Cove', 'Isle of Sums', 'Times Atoll', 'Zoology']);
  expect(voyage.islands.map(island => island.state)).toEqual(['explored', 'reached', 'uncharted', 'uncharted']);
});

test('skills climb each island by prerequisite depth', () => {
  const cove = buildVoyage(topics).islands[0];
  expect(cove.topics.map(t => [t.id, t.depth, t.step])).toEqual([['count', 0, 0], ['skip', 1, 1]]);
  expect(buildVoyage(topics).topics.find(t => t.id === 'mystery')!.depth).toBe(3);
});

test('links say whether the route is walked, open or still ahead', () => {
  const links = buildVoyage(topics).links.map(link => `${link.from.id}>${link.to.id}:${link.kind}:${link.crossIsland}`);
  expect(links).toContain('count>skip:walked:false');
  expect(links).toContain('count>add:open:true');
  expect(links).toContain('add>times:ahead:true');
});

test('the ship waits at the furthest island with progress', () => {
  expect(buildVoyage(topics).frontier).toBe(1);
  expect(buildVoyage([topic('x', 'Fractions', [], 'unstarted', false)]).frontier).toBe(0);
});

test('a prerequisite cycle does not hang the layout', () => {
  const voyage = buildVoyage([topic('a', 'Fractions', ['b'], 'unstarted'), topic('b', 'Fractions', ['a'], 'unstarted')]);
  expect(voyage.topics).toHaveLength(2);
});

test('a chain follows prerequisites all the way down and dependents all the way up', () => {
  const voyage = buildVoyage(topics);
  expect([...chainOf(voyage, 'times', 'below')].sort()).toEqual(['add', 'count']);
  expect([...chainOf(voyage, 'count', 'above')].sort()).toEqual(['add', 'mystery', 'skip', 'times']);
  expect(chainOf(voyage, 'mystery', 'above').size).toBe(0);
});
