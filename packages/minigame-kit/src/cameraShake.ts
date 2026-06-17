// Shared camera "trauma" so gameplay events can punch the camera for impact.
// Module singleton: App (on each answer) triggers punchCamera(); the stage camera
// consumes a decaying offset every frame. No React re-renders involved.
let trauma = 0;

/** Add impact. amount ~0.2 (soft) .. 0.7 (big). Clamped. */
export function punchCamera(amount: number): void {
  trauma = Math.min(1, trauma + amount);
}

/** Per-frame: an [x,y] world-space camera offset; decays trauma. Call once/frame. */
export function consumeShake(delta: number): readonly [number, number] {
  if (trauma <= 0) return [0, 0];
  const m = trauma * trauma; // quadratic ease-out feels punchier
  trauma = Math.max(0, trauma - delta * 1.9);
  return [(Math.random() * 2 - 1) * m * 0.55, (Math.random() * 2 - 1) * m * 0.45];
}
