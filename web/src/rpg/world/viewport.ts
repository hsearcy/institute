/** Orthographic framing in world units. Use with the existing isometric camera
 * position/lookAt, then set left/right to +/-halfHeight*(width/height).
 *
 * Full-height desktop views show 16.2 m vertically (30% larger actors than the old
 * 21 m framing). Narrow phones keep 12.8 m across for the hero and approaching pack,
 * instead of the old 25.2 m. Short screens tighten gradually; a separate landscape combat pane can
 * tighten further because the question dock no longer covers its lower half.
 * No aspect-ratio breakpoint jumps occur when rotating a device.
 *
 * This controls zoom only. The caller retains responsibility for camera target
 * placement above its question dock; HUD height must not affect learning state.
 */
export function dungeonCameraHalfHeight(width: number, height: number, separateControls = false): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1440;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 900;
  const aspect = safeWidth / safeHeight;
  const shortScreen = Math.max(0, Math.min(1, (600 - safeHeight) / 220));
  return Math.max(8.1 - (separateControls ? 1.9 : .9) * shortScreen, 6.4 / aspect);
}

/** Lift the action above the question dock on short landscape displays. */
export function dungeonCameraVerticalOffset(height: number, separateControls = false): number {
  if (separateControls) return 0;
  return Number.isFinite(height) && height > 0 ? -1.6 * Math.max(0, Math.min(1, (600 - height) / 220)) : 0;
}

/** Center portrait action in the space between navigation and the measured dock.
 * Changing a hint or opening the keypad moves the frame, never the actors or tutor.
 */
export function dungeonPortraitOffset(width: number, height: number, top: number, bottom: number): number {
  if (![width, height, top, bottom].every(Number.isFinite) || width <= 0 || width > 760
    || height <= width || bottom <= top) return 0;
  const start = Math.max(0, Math.min(height, top)), end = Math.max(start, Math.min(height, bottom));
  return ((start + end) / height - 1) * dungeonCameraHalfHeight(width, height);
}

/** Fit a static formation beneath the HUD in the separate landscape pane.
 * Preserve the closer zoom whenever the full formation already fits. */
export function dungeonCombatFrame(minY: number, maxY: number, top: number, bottom: number, height: number): { scale: number; shift: number } {
  if (![minY, maxY, top, bottom, height].every(Number.isFinite) || height <= 0 || maxY < minY || bottom <= top) return { scale: 1, shift: 0 };
  const scale = Math.max(1, (maxY - minY) / (bottom - top));
  const first = height / 2 + (minY - height / 2) / scale;
  const last = height / 2 + (maxY - height / 2) / scale;
  return { scale, shift: Math.max(top - first, Math.min(0, bottom - last)) };
}
