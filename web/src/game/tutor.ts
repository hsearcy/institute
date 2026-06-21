// Talks to the tutor server. The shared schema types flow across the boundary.
import type { Problem, Branches, Skill } from '@institute/shared';
import { API, PROFILE } from './config';

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export function fetchFirst(): Promise<Problem> {
  return post<Problem>('/tutor/first', { profileId: PROFILE });
}

export function fetchBranches(current: Problem): Promise<Branches> {
  return post<Branches>('/tutor/branches', { profileId: PROFILE, current });
}

export function recordAttempt(a: {
  problemId: string;
  skill: Skill;
  correct: boolean;
  solveMs: number;
  difficulty: number;
}): void {
  // fire-and-forget; never block gameplay on telemetry
  post('/tutor/attempt', { profileId: PROFILE, ...a }).catch(() => {});
}
