export function solvePlanarLeg(upperY: number, upperZ: number, lowerY: number, lowerZ: number, targetY: number, targetZ: number) {
  const a = Math.hypot(upperY, upperZ), b = Math.hypot(lowerY, lowerZ);
  if (a < 1e-6 || b < 1e-6) return { upper: 0, lower: 0 };
  const distance = Math.max(Math.abs(a - b) + 1e-5, Math.min(a + b - 1e-5, Math.hypot(targetY, targetZ)));
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const alpha = Math.atan2(-targetZ, -targetY) - Math.acos(clamp((a * a + distance * distance - b * b) / (2 * a * distance)));
  const bend = Math.PI - Math.acos(clamp((a * a + b * b - distance * distance) / (2 * a * b)));
  const upper = alpha - Math.atan2(-upperZ, -upperY);
  return { upper, lower: alpha + bend - upper - Math.atan2(-lowerZ, -lowerY) };
}
