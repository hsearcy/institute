// Exercise RPG routes through the real tutor app using isolated in-memory data.
process.env.DB_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = 'test-key-no-network';
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
process.env.TUTOR_MAX_RETRIES = '0';
process.env.TUTOR_TIMEOUT_MS = '300';
import { expect, test } from 'bun:test';
const { default: server, grantShieldForTest } = await import('./index');
const call = async (path: string, body?: unknown) => {
  const response = await server.fetch(new Request(`http://test${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  expect(response.status).toBe(200);
  return response.json() as Promise<any>;
};

test('real tutor first answer, retry solve and skip all power RPG without changing learning outcomes', async () => {
  const profileId = 'rpg-integration-child';
  const start = await call('/rpg/start', { profileId });
  for (const outcome of ['correct', 'retry', 'skip'] as const) {
    const state = await call(`/rpg/state?profileId=${profileId}`);
    const problem = await call('/tutor/first', { profileId });
    const attempt = { profileId, problemId: problem.id, skill: problem.skill, topicId: problem.topicId, difficulty: problem.difficulty, solveMs: 5000 };
    if (outcome === 'skip') await call('/tutor/skip', attempt);
    else {
      await call('/tutor/attempt', { ...attempt, correct: outcome === 'correct' });
      if (outcome === 'retry') await call('/reward/retry-solve', { profileId, problemId: problem.id });
    }
    const beforeMastery = await call(`/mastery?profileId=${profileId}`);
    const beforeRewards = await call(`/state?profileId=${profileId}`);
    const body = { profileId, problemId: problem.id, expeditionId: start.expedition.id, encounterIndex: state.expedition.encounterIndex, assisted: outcome === 'skip' };
    const result = await call('/rpg/resolve', body);
    const retry = await call('/rpg/resolve', body);
    expect(result.reward.xp).toBe(32);
    expect(retry.duplicate).toBe(true);
    expect(retry.state).toEqual(result.state);
    expect(await call(`/mastery?profileId=${profileId}`)).toEqual(beforeMastery);
    expect(await call(`/state?profileId=${profileId}`)).toEqual(beforeRewards);
  }
  const state = await call(`/rpg/state?profileId=${profileId}`);
  expect(state).toMatchObject({ xp: 96, level: 2, skillPoints: 1, expedition: { encounterIndex: 1 } });
});

test('a lost tutor response can be reconciled without reposting or double-counting mastery', async () => {
  const profileId = 'rpg-lost-response-child';
  const problem = await call('/tutor/first', { profileId });
  const statusUrl = `/rpg/attempt-status?profileId=${profileId}&problemId=${problem.id}`;
  expect(await call(statusUrl)).toEqual({ recorded: false, correct: null, solved: false, skipped: false });
  // The server commits; pretend the browser loses the response body.
  const discarded = await server.fetch(new Request('http://test/tutor/attempt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, problemId: problem.id, skill: problem.skill, topicId: problem.topicId, correct: true, difficulty: problem.difficulty, solveMs: 5000 }),
  }));
  expect(discarded.status).toBe(200);
  const before = await call(`/mastery?profileId=${profileId}`);
  expect(await call(statusUrl)).toEqual({ recorded: true, correct: true, solved: true, skipped: false });
  expect(await call(statusUrl)).toEqual({ recorded: true, correct: true, solved: true, skipped: false });
  const after = await call(`/mastery?profileId=${profileId}`);
  expect(after).toEqual(before);
  expect(after.topics.find((topic: any) => topic.id === problem.topicId).attempts).toBe(1);
});


test('an exhausted RPG problem preserves the legacy shield outcome exactly once across retries', async () => {
  const profileId = 'rpg-exhausted-child';
  grantShieldForTest(profileId);
  grantShieldForTest(profileId);
  const problem = await call('/tutor/first', { profileId });
  await call('/tutor/attempt', { profileId, problemId: problem.id, skill: problem.skill, topicId: problem.topicId, correct: false, solveMs: 5000 });
  const learning = await call(`/mastery?profileId=${profileId}`);
  const first = await call('/rpg/miss', { profileId, problemId: problem.id });
  expect(first.reward.shieldUsed).toBe(true);
  expect(first.reward.shields).toBe(1);
  expect(await call('/rpg/miss', { profileId, problemId: problem.id })).toEqual(first);
  expect((await call(`/state?profileId=${profileId}`)).shields).toBe(1);
  expect(await call(`/mastery?profileId=${profileId}`)).toEqual(learning);
  const rejected = await server.fetch(new Request('http://test/rpg/miss', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: 'another-profile', problemId: problem.id }),
  }));
  expect(rejected.status).toBe(400);
});

test('adventure shop shares the old gem wallet and preserves daily/weekly quests and learning', async () => {
  const profileId = 'rpg-camp-wallet-integration';
  // Earn through the real legacy reward route, including its quest rewards.
  let legacy = await call(`/state?profileId=${profileId}`);
  const camp = await call(`/rpg/camp?profileId=${profileId}`);
  const offer = camp.offers.find((entry: any) => entry.itemId === 'cinderwand');
  expect(offer).toBeDefined();
  for (let i = 0; legacy.gems < offer.price && i < 100; i++) {
    const problem = await call('/tutor/first', { profileId });
    await call('/tutor/attempt', {
      profileId, problemId: problem.id, skill: problem.skill, topicId: problem.topicId,
      difficulty: problem.difficulty, correct: true, solveMs: 5000,
    });
    legacy = await call(`/state?profileId=${profileId}`);
  }
  expect(legacy.gems).toBeGreaterThanOrEqual(offer.price);
  expect(legacy.quests.some((quest: any) => quest.progress > 0)).toBe(true);
  const mastery = await call(`/mastery?profileId=${profileId}`);
  const purchase = { profileId, itemId: 'cinderwand', requestId: 'wallet-purchase-once' };
  const bought = await call('/rpg/shop/buy', purchase);
  expect(bought.state.inventory).toContain('cinderwand');
  expect(bought.gems).toBe(legacy.gems - offer.price);
  await call('/rpg/shop/buy', purchase);
  const after = await call(`/state?profileId=${profileId}`);
  expect(after.gems).toBe(bought.gems);
  expect(after.lifetimeGems).toBe(legacy.lifetimeGems);
  expect(after.quests).toEqual(legacy.quests);
  expect(after.weeklyQuest).toEqual(legacy.weeklyQuest);
  expect(after.equipped).toBe(legacy.equipped);
  expect(await call(`/mastery?profileId=${profileId}`)).toEqual(mastery);
  expect((await call(`/shop?profileId=${profileId}`)).gems).toBe(bought.gems);
  const reloaded = await call(`/rpg/state?profileId=${profileId}`);
  expect(reloaded.loot.filter((item: any) => item.itemId === 'cinderwand')).toHaveLength(1);
});
