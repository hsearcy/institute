/** First-room art direction. Coordinates are room-local and leave combat/travel
 * space untouched. Other rooms retain their existing placement rules. */
export function roomHasTomb(room: number, side: number, index: number): boolean {
  return room !== 0 || side > 0 || index === 0;
}

export const gateBreach = { minZ: -5.7, maxZ: -1.7 } as const;

/** Upper courses taper into a breach between the surviving west piers. */
export function brokenGateWallCrown(z: number, intactHeight: number): number {
  const distance = Math.abs(z + 3.7);
  if (distance >= 3.5) return intactHeight;
  const shoulder = Math.pow(Math.min(1, distance / 3.5), 1.45);
  return Math.min(intactHeight, .85 + shoulder * (intactHeight - .85) + Math.sin(z * 4.3) * .17);
}

export const gateRubble = [
  // Heavy courses stay beside the missing span; smaller blocks fan inward.
  { x: -10.0, z: -3.3, width: 1.15, height: .58, depth: .76, angle: .32 },
  { x: -9.8, z: -1.9, width: 1.38, height: .39, depth: .74, angle: -.19 },
  { x: -9.7, z: -.7, width: .96, height: .47, depth: .69, angle: .66 },
  { x: -9.4, z: -4.1, width: .86, height: .31, depth: .55, angle: .98 },
  { x: -9.0, z: -2.4, width: .82, height: .34, depth: .61, angle: -.53 },
  { x: -8.5, z: -.9, width: .75, height: .24, depth: .48, angle: .74 },
  { x: -9.0, z: .35, width: 1.08, height: .32, depth: .60, angle: -.35 },
  { x: -8.0, z: .55, width: .63, height: .17, depth: .42, angle: .91 },
  { x: -7.7, z: -1.05, width: .52, height: .15, depth: .39, angle: -.27 },
] as const;

/** x,z,width,depth,angle,kind. Flat, UV-registered changes to existing paving. */
export const gateWear = [
  [-9.2, -2.0, 3.2, 5.4, -.12, 'dust'],
  [-8.1, -.8, 1.9, 2.9, .34, 'dust'],
  [-8.9, 5.6, 2.6, 2.8, -.25, 'dust'],
  [4.8, -1.1, 2.3, 6.4, .08, 'damp'],
] as const;

export const gateBrazierSoot = [{ x: -7.9, z: -3.8 }, { x: 7.9, z: 3.2 }] as const;
