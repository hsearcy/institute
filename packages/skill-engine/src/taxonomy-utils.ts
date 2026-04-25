import type { Skill, SkillId, Taxonomy } from "./types.ts";

export type ValidationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: string[] };

export function validateTaxonomy(taxonomy: ReadonlyArray<Skill>): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<SkillId>();

  for (const s of taxonomy) {
    if (ids.has(s.id)) errors.push(`duplicate skill id: ${s.id}`);
    ids.add(s.id);
    const [lo, hi] = s.difficultyBand;
    if (!(lo >= 0 && hi <= 1 && lo <= hi)) {
      errors.push(`skill ${s.id}: invalid difficultyBand [${lo}, ${hi}]`);
    }
  }

  for (const s of taxonomy) {
    for (const p of s.prereqs) {
      if (!ids.has(p)) errors.push(`skill ${s.id} references unknown prereq: ${p}`);
    }
  }

  if (hasCycle(taxonomy)) errors.push("taxonomy contains a cycle");

  return errors.length === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors };
}

function hasCycle(taxonomy: ReadonlyArray<Skill>): boolean {
  const adj = new Map<SkillId, SkillId[]>();
  for (const s of taxonomy) adj.set(s.id, [...s.prereqs]);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<SkillId, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  function dfs(id: SkillId): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE && dfs(id)) return true;
  }
  return false;
}

export function prereqsOf(taxonomy: Taxonomy, id: SkillId): SkillId[] {
  return taxonomy.find((s) => s.id === id)?.prereqs ?? [];
}

export function getSkill(taxonomy: Taxonomy, id: SkillId): Skill | undefined {
  return taxonomy.find((s) => s.id === id);
}
