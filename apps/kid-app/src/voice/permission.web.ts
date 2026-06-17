// Web mic permission via getUserMedia directly (more reliable on web than
// expo-audio's permission API). Prompts once, releases the stream immediately —
// the recorder re-acquires it (no second prompt once granted). Metro resolves
// this over permission.ts on web.
let _cached: boolean | null = null;

export async function ensureMicPermission(): Promise<boolean> {
  if (_cached !== null) return _cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const stream = await nav.mediaDevices.getUserMedia({ audio: true });
    try { stream.getTracks().forEach((t: { stop: () => void }) => t.stop()); } catch { /* ignore */ }
    _cached = true;
  } catch {
    _cached = false;
  }
  return _cached;
}

/** Test-only — wipes the cache so each test starts fresh. */
export function _resetForTests(): void {
  _cached = null;
}
