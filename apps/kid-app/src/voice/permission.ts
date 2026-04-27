import { requestRecordingPermissionsAsync } from "expo-audio";

let _cached: boolean | null = null;

export async function ensureMicPermission(): Promise<boolean> {
  if (_cached !== null) return _cached;
  const r = await requestRecordingPermissionsAsync();
  _cached = r.status === "granted";
  return _cached;
}

/** Test-only — wipes the cache so each test starts fresh. */
export function _resetForTests(): void {
  _cached = null;
}
