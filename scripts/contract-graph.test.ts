// scripts/contract-graph.test.ts
import { describe, expect, test } from "bun:test";
import { contractEdges } from "./contract-graph.ts";

// A ← B ← C ← D (X ← Y means "Y depends on X"). Curated = {A, C, D}.
// B is excluded, so C's dependency on B must contract to A.
const edges = [
  { topicId: "B", prerequisiteId: "A", strength: "hard" },
  { topicId: "C", prerequisiteId: "B", strength: "hard" },
  { topicId: "D", prerequisiteId: "C", strength: "hard" },
];

describe("contractEdges", () => {
  test("contracts through excluded nodes", () => {
    const out = contractEdges(edges, new Set(["A", "C", "D"]));
    expect(out.get("C")).toEqual(["A"]);
    expect(out.get("D")).toEqual(["C"]);
    expect(out.get("A")).toEqual([]);
  });
  test("ignores soft edges", () => {
    const soft = [{ topicId: "C", prerequisiteId: "A", strength: "soft" }];
    expect(contractEdges(soft, new Set(["A", "C"])).get("C")).toEqual([]);
  });
  test("stops at the first curated ancestor (no skipping past it)", () => {
    // D ← C ← B ← A, all hard, curated {A, C, D}: D must get C only, not also A.
    const out = contractEdges(edges, new Set(["A", "C", "D"]));
    expect(out.get("D")).toEqual(["C"]);
  });
  test("dedupes diamond paths", () => {
    // Z depends on X via two excluded intermediates.
    const dia = [
      { topicId: "m1", prerequisiteId: "X", strength: "hard" },
      { topicId: "m2", prerequisiteId: "X", strength: "hard" },
      { topicId: "Z", prerequisiteId: "m1", strength: "hard" },
      { topicId: "Z", prerequisiteId: "m2", strength: "hard" },
    ];
    expect(contractEdges(dia, new Set(["X", "Z"])).get("Z")).toEqual(["X"]);
  });
});

describe("contractEdges with union strengths", () => {
  const mixed = [
    { topicId: "B", prerequisiteId: "A", strength: "soft" },
    { topicId: "C", prerequisiteId: "B", strength: "hard" },
  ];
  test("union contraction crosses soft hops", () => {
    const out = contractEdges(mixed, new Set(["A", "C"]), new Set(["hard", "soft"]));
    expect(out.get("C")).toEqual(["A"]);
  });
  test("default stays hard-only", () => {
    expect(contractEdges(mixed, new Set(["A", "C"])).get("C")).toEqual([]);
  });
});
