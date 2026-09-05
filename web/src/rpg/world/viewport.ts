/** Orthographic framing in world units. Use with the existing isometric camera
 * position/lookAt, then set left/right to +/-halfHeight*(width/height).
 *
 * Full-height desktop views show 16.2 m vertically (30% larger actors than the old
 * 21 m framing). Narrow phones keep 12.8 m across for the hero and approaching pack,
 * instead of the old 25.2 m. Short landscape screens tighten another 0.9 m gradually.
 * No aspect-ratio breakpoint jumps occur when rotating a device.
 *
 * This controls zoom only. The caller retains responsibility for camera target
 * placement above its question dock; HUD height must not affect learning state.
 */
export function dungeonCameraHalfHeight(width: number, height: number): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1440;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 900;
  const aspect = safeWidth / safeHeight;
  const shortScreen = Math.max(0, Math.min(1, (600 - safeHeight) / 220));
  return Math.max(8.1 - .9 * shortScreen, 6.4 / aspect);
}

/** Lift the action above the question dock on short landscape displays. */
export function dungeonCameraVerticalOffset(height: number): number {
  return Number.isFinite(height) && height > 0 ? -1.6 * Math.max(0, Math.min(1, (600 - height) / 220)) : 0;
}
