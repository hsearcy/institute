// scripts/contract-graph.ts — contract taxonomy prereq edges onto a curated subset.
// For each curated topic, walk hard-prereq ancestors; the nearest curated ancestor
// on each path becomes a direct prereq (excluded intermediates are skipped over).
export type Edge = { topicId: string; prerequisiteId: string; strength: string };

export function contractEdges(edges: Edge[], curated: Set<string>): Map<string, string[]> {
  const hardPrereqs = new Map<string, string[]>();
  for (const e of edges) {
    if (e.strength !== "hard") continue;
    const arr = hardPrereqs.get(e.topicId) ?? [];
    arr.push(e.prerequisiteId);
    hardPrereqs.set(e.topicId, arr);
  }
  const out = new Map<string, string[]>();
  for (const id of curated) {
    const found = new Set<string>();
    const seen = new Set<string>([id]);
    const queue = [...(hardPrereqs.get(id) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (curated.has(cur)) { found.add(cur); continue; } // stop at curated ancestor
      queue.push(...(hardPrereqs.get(cur) ?? []));
    }
    out.set(id, [...found].sort());
  }
  return out;
}
