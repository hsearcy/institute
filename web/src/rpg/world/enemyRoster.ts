export type EnemyModelId = 'guardian' | 'revenant' | 'skeleton' | 'wraith';
export type EnemyRosterEntry = Readonly<{
  modelId: EnemyModelId;
  height: number;
  brute: boolean;
  boss: boolean;
}>;

/** Presentation only. The caller supplies the authoritative encounter count;
 * changing armor, silhouettes, or room dressing never changes that count.
 * Fractional counts truncate, invalid/negative counts are empty. */
export function enemyRoster(encounterIndex: number, count: number): EnemyRosterEntry[] {
  const room = Number.isFinite(encounterIndex) ? Math.max(0, Math.min(5, Math.trunc(encounterIndex))) : 0;
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  const phase = ((room * 7) % 20) / 20;
  let ordinary = 0;
  return Array.from({ length: total }, (_, index) => {
    // Keep the established large silhouettes and boss placement intact.
    if (index % 7 === 0) {
      const boss = room === 5 && index === 0;
      return { modelId: 'guardian', height: boss ? 3.8 : 2.5, brute: true, boss };
    }
    const ordinal = ordinary++;
    // A balanced35% sequence spreads armor across each progressive formation
    // instead of putting all knights in one contiguous block of the roster.
    const armored = Math.floor((ordinal + 1) * .35 + phase) > Math.floor(ordinal * .35 + phase);
    if (armored) return { modelId: 'revenant', height: 1.8 + ((ordinal * 11 + room * 7) % 16) / 100, brute: false, boss: false };
    const wraith = (ordinal + room * 2) % 5 === 3;
    return { modelId: wraith ? 'wraith' : 'skeleton', height: wraith ? 1.85 : 1.65, brute: false, boss: false };
  });
}
