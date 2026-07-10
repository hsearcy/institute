// scripts/import-taxonomy.mjs — one-time: filter an os-taxonomy checkout to Mathematics.
// Usage: bun scripts/import-taxonomy.mjs /path/to/os-taxonomy
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = process.argv[2];
if (!src) { console.error("usage: bun scripts/import-taxonomy.mjs <os-taxonomy dir>"); process.exit(1); }

const topics = JSON.parse(readFileSync(join(src, "data/topics.json"), "utf8")).topics;
const deps = JSON.parse(readFileSync(join(src, "data/dependencies.json"), "utf8")).dependencies;

const math = topics.filter((t) => t.subject === "Mathematics");
const mathIds = new Set(math.map((t) => t.id));
// Keep only edges internal to Mathematics (drops e.g. "Number Words" → phonics edges).
const mathDeps = deps.filter((d) => mathIds.has(d.topicId) && mathIds.has(d.prerequisiteId));

mkdirSync("data/taxonomy", { recursive: true });
writeFileSync("data/taxonomy/topics.json", JSON.stringify({ topics: math }, null, 1));
writeFileSync("data/taxonomy/dependencies.json", JSON.stringify({ dependencies: mathDeps }, null, 1));
console.log(`wrote ${math.length} topics, ${mathDeps.length} edges`);
