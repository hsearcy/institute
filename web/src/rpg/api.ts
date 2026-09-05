import { API, PROFILE } from '../game/config';
import type { RpgState, RpgResolveResult } from '@institute/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ profileId: PROFILE, ...body }) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.error ?? error.reason ?? `Connection failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getRpgState = () => request<RpgState>(`/rpg/state?profileId=${encodeURIComponent(PROFILE)}`);
export const mutateRpg = (action: string, body: Record<string, unknown> = {}) => request<RpgState>(`/rpg/${action}`, body);
export const resolveEncounter = (body: Record<string, unknown>) => request<RpgResolveResult>('/rpg/resolve', body);
export type AttemptStatus = { recorded: boolean; correct: boolean | null; solved: boolean; skipped: boolean };
export const attemptStatus = (problemId: string) => request<AttemptStatus>(`/rpg/attempt-status?profileId=${encodeURIComponent(PROFILE)}&problemId=${encodeURIComponent(problemId)}`);
