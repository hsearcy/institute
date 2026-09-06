export type CombatHit = { damage: number; hpBefore: number; hpAfter: number };
export type HitReaction = {
  at: number; lethal: boolean; element: 'fire' | 'electric' | 'other';
  x: number; z: number; dx: number; dz: number; strength: number; side: number; duration: number;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Presentation only: consumes the authoritative outcome without rolling damage. */
export function createHitReaction(input: {
  at: number; x: number; z: number; sourceX: number; sourceZ: number;
  phase: number; heavy: boolean; maxHp: number; hit?: CombatHit;
  element: HitReaction['element'];
}): HitReaction {
  const dx = input.x - input.sourceX, dz = input.z - input.sourceZ, length = Math.hypot(dx, dz);
  return {
    at: input.at, lethal: input.hit ? input.hit.hpAfter <= 0 : true, element: input.element,
    x: input.x, z: input.z, dx: length > 1e-6 ? dx / length : 0, dz: length > 1e-6 ? dz / length : 1,
    strength: (.65 + .35 * clamp((input.hit?.damage ?? input.maxHp) / Math.max(1, input.maxHp))) * (input.heavy ? .72 : 1),
    side: Math.sin(input.phase * 2.37) < 0 ? -1 : 1,
    duration: 1.85 + Math.abs(Math.sin(input.phase * 1.13)) * .25,
  };
}

/** Snap into recoil, catch the weight, then recover. No freeze of the world clock. */
export function sampleHitReaction(reaction: HitReaction, now: number) {
  const age = Math.max(0, now - reaction.at);
  const impulse = smooth(age / .045) * (1 - smooth((age - .11) / .25));
  const recovery = smooth((age - .40) / .7);
  const pressure = reaction.lethal ? smooth(age / .12) : (.55 * smooth(age / .10) + .45 * smooth((age - .22) / .18)) * (1 - recovery);
  const step = smooth((age - .08) / .20);
  return {
    age, recoil: impulse * reaction.strength,
    displacement: pressure * reaction.strength * (reaction.element === 'fire' ? .34 : .22),
    // Suppress idle stepping during the catch so planted feet do not jitter.
    control: reaction.lethal ? 1 : 1 - recovery,
    brace: smooth((age - .10) / .23) * (1 - smooth((age - .55) / .55)) * reaction.strength,
    catchStep: smooth((age - .23) / .19) * (1 - smooth((age - .65) / .45)) * reaction.strength,
    footOffset: -.38 * step * (1 - smooth((age - .65) / .45)) * reaction.strength,
    footLift: age < .28 ? Math.sin(step * Math.PI) * .09 : 0,
    light: Math.exp(-age * 24) * reaction.strength,
    // A settled full-size body remains visible before its element dissipates.
    erosion: reaction.lethal ? smooth((age - 1.2) / (reaction.duration - 1.2)) : 0,
    collapseAge: reaction.lethal ? Math.max(0, age - .10) : undefined,
    complete: age >= (reaction.lethal ? reaction.duration : 1.1),
  };
}
