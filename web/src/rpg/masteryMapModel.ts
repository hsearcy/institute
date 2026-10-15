import type { MasteryTopic } from './tutor';

export type VoyageStatus = 'mastered' | 'practicing' | 'ready' | 'locked';
export type IslandState = 'explored' | 'reached' | 'uncharted';
/** How a prerequisite link reads: walked (both mastered), open (leads to an unlocked skill), or ahead (leads to a locked skill). */
export type LinkKind = 'walked' | 'open' | 'ahead';

export type VoyageTopic = MasteryTopic & { status: VoyageStatus; depth: number; island: number; step: number };
export type VoyageIsland = {
  index: number; domain: string; name: string; topics: VoyageTopic[];
  mastered: number; practicing: number; open: number; state: IslandState; minDepth: number; maxDepth: number;
};
export type VoyageLink = { from: VoyageTopic; to: VoyageTopic; kind: LinkKind; crossIsland: boolean };
export type Voyage = { islands: VoyageIsland[]; topics: VoyageTopic[]; links: VoyageLink[]; frontier: number };

/** The order he sails the domains. Domains outside this list follow, shallowest first. */
export const VOYAGE_ROUTE = ['Counting & Cardinality', 'Addition & Subtraction', 'Number Representation & Place Value', 'Measurement', 'Multiplication & Division', 'Fractions'];
const ISLAND_NAMES: Record<string, string> = {
  'Counting & Cardinality': 'Counting Cove', 'Addition & Subtraction': 'Isle of Sums', 'Number Representation & Place Value': 'Place Value Key',
  'Measurement': 'Measure Reef', 'Multiplication & Division': 'Times Atoll', 'Fractions': 'Fraction Rock',
};
export const islandName = (domain: string): string => ISLAND_NAMES[domain] ?? domain;

export function voyageStatus(topic: MasteryTopic): VoyageStatus {
  if (!topic.unlocked) return 'locked';
  if (topic.state === 'mastered') return 'mastered';
  return topic.state === 'practicing' ? 'practicing' : 'ready';
}

/** Lays the taxonomy out as a voyage: islands in route order, skills up each island by prerequisite depth. */
export function buildVoyage(topics: readonly MasteryTopic[]): Voyage {
  const byId = new Map(topics.map(topic => [topic.id, topic]));
  const depths = new Map<string, number>();
  const depthOf = (topic: MasteryTopic): number => {
    const known = depths.get(topic.id);
    if (known !== undefined) return known;
    depths.set(topic.id, 0); // Cycle guard: a looping edge counts as no groundwork.
    const prereqs = topic.prereqs.map(id => byId.get(id)).filter((p): p is MasteryTopic => !!p);
    const depth = prereqs.length ? 1 + Math.max(...prereqs.map(depthOf)) : 0;
    depths.set(topic.id, depth);
    return depth;
  };
  const domains = [...new Set(topics.map(topic => topic.domain))];
  const meanDepth = (domain: string) => { const list = topics.filter(t => t.domain === domain); return list.reduce((sum, t) => sum + depthOf(t), 0) / list.length; };
  const rank = (domain: string) => { const i = VOYAGE_ROUTE.indexOf(domain); return i < 0 ? VOYAGE_ROUTE.length + meanDepth(domain) : i; };
  domains.sort((a, b) => rank(a) - rank(b));

  const all: VoyageTopic[] = [];
  const islands = domains.map((domain, index): VoyageIsland => {
    const list = topics.filter(topic => topic.domain === domain)
      .map((topic, order) => ({ topic, order, depth: depthOf(topic) }))
      .sort((a, b) => a.depth - b.depth || a.order - b.order)
      .map(({ topic, depth }, step): VoyageTopic => ({ ...topic, status: voyageStatus(topic), depth, island: index, step }));
    all.push(...list);
    const count = (status: VoyageStatus) => list.filter(topic => topic.status === status).length;
    const mastered = count('mastered'), practicing = count('practicing'), open = list.length - count('locked');
    return {
      index, domain, name: islandName(domain), topics: list, mastered, practicing, open,
      state: mastered ? 'explored' : open ? 'reached' : 'uncharted',
      minDepth: Math.min(...list.map(t => t.depth)), maxDepth: Math.max(...list.map(t => t.depth)),
    };
  });

  const placed = new Map(all.map(topic => [topic.id, topic]));
  const links: VoyageLink[] = [];
  for (const to of all) for (const id of to.prereqs) {
    const from = placed.get(id);
    if (!from) continue;
    const kind: LinkKind = to.status === 'locked' ? 'ahead' : from.status === 'mastered' && to.status === 'mastered' ? 'walked' : 'open';
    links.push({ from, to, kind, crossIsland: from.island !== to.island });
  }
  const frontier = islands.reduce((last, island) => island.mastered || island.practicing ? island.index : last, 0);
  return { islands, topics: all, links, frontier };
}

/** Every skill reached by following prerequisite links down (what it builds on) or up (what it leads to). */
export function chainOf(voyage: Voyage, id: string, direction: 'below' | 'above'): Set<string> {
  const found = new Set<string>(), queue = [id];
  while (queue.length) {
    const current = queue.pop()!;
    for (const link of voyage.links) {
      const next = direction === 'below' ? (link.to.id === current ? link.from.id : null) : (link.from.id === current ? link.to.id : null);
      if (next && next !== id && !found.has(next)) { found.add(next); queue.push(next); }
    }
  }
  return found;
}
