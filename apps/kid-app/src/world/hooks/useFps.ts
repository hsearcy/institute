// apps/kid-app/src/world/hooks/useFps.ts
import { useRef, useState } from "react";

export const FPS_WINDOW = 60;

/**
 * Pure: given a list of frame-end timestamps (ms), compute current FPS.
 * Returns 0 if too few samples to measure.
 */
export function computeFps(stamps: ReadonlyArray<number>): number {
  if (stamps.length < 2) return 0;
  const first = stamps[0]!;
  const last = stamps[stamps.length - 1]!;
  const elapsedMs = last - first;
  if (elapsedMs <= 0) return 0;
  const frames = stamps.length - 1;
  return Math.round((frames * 1000) / elapsedMs);
}

/**
 * React hook for frame-time tracking. Pushes timestamps from R3F's
 * useFrame into a rolling buffer; updates the visible FPS at most every
 * 10 frames so the overlay doesn't churn the React tree on every frame.
 *
 * Wire as:
 *   const fps = useFps();
 *   useFrame(({ clock }) => fps.tick(clock.elapsedTime * 1000));
 *   // <Text>{fps.value} FPS</Text>
 */
export function useFps(): { value: number; tick: (nowMs: number) => void } {
  const buf = useRef<number[]>([]);
  const tickCount = useRef(0);
  const [value, setValue] = useState(0);

  const tick = (nowMs: number) => {
    buf.current.push(nowMs);
    if (buf.current.length > FPS_WINDOW) buf.current.shift();
    tickCount.current += 1;
    if (tickCount.current % 10 === 0) {
      setValue(computeFps(buf.current));
    }
  };

  return { value, tick };
}
