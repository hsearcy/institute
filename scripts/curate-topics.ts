// scripts/curate-topics.ts — emit shared/src/topics.json from vendored taxonomy + curation.
import { readFileSync, writeFileSync } from "node:fs";
import { contractEdges, type Edge } from "./contract-graph.ts";
import { CURATION } from "./curation.ts";

type RawTopic = {
  id: string; name: string; domain: string; description: string;
  ageRangeStart: number; ageRangeEnd: number; evidence: string[]; assessmentPrompt: string;
};

const topics = JSON.parse(readFileSync("data/taxonomy/topics.json", "utf8")).topics as RawTopic[];
const deps = JSON.parse(readFileSync("data/taxonomy/dependencies.json", "utf8")).dependencies as Edge[];
const byId = new Map(topics.map((t) => [t.id, t]));

const curatedIds = new Set(CURATION.map((c) => c.id));
for (const c of CURATION) if (!byId.has(c.id)) throw new Error(`unknown taxonomy id ${c.id}`);
const prereqs = contractEdges(deps, curatedIds);

const out = CURATION.map((c) => {
  const t = byId.get(c.id)!;
  return {
    id: c.id,
    name: t.name,
    kidLabel: c.kidLabel,
    domain: t.domain,
    ageRange: [t.ageRangeStart, t.ageRangeEnd],
    description: t.description,
    evidence: t.evidence,
    assessmentPrompt: t.assessmentPrompt,
    legacySkill: c.legacySkill,
    gen: c.gen,
    fluentMs: c.fluentMs,
    prereqs: prereqs.get(c.id) ?? [],
  };
});

// Sanity: at least one root, so the graph is startable.
const roots = out.filter((t) => t.prereqs.length === 0);
if (roots.length === 0) throw new Error("no root topics — graph is unstartable");
writeFileSync(
  "shared/src/topics.json",
  JSON.stringify({ _attribution: "Marble Skill Taxonomy v1 © Generative Spark, Inc. — ODbL 1.0 / CC BY-SA 4.0 — see data/taxonomy/NOTICE", topics: out }, null, 1),
);
console.log(`wrote ${out.length} topics; roots: ${roots.map((r) => r.name).join(" | ")}`);
