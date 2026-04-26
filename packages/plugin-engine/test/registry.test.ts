import { test, expect, describe, beforeEach } from "vitest";
import { z } from "zod";
import { register, getPlugin, listPluginIds, clearRegistry } from "../src/registry.ts";
import type { Plugin } from "../src/contract.ts";

const fakePlugin = (id: string): Plugin<{ n: number }> => ({
  manifest: {
    id,
    title: id,
    supportedSkills: ["x"],
    paramSchema: z.object({ n: z.number() }),
  },
  Scene: () => null,
  evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
});

describe("registry", () => {
  beforeEach(() => clearRegistry());

  test("getPlugin returns undefined when nothing registered", () => {
    expect(getPlugin("missing")).toBeUndefined();
  });

  test("register then getPlugin round-trips", () => {
    const p = fakePlugin("alpha");
    register(p);
    expect(getPlugin("alpha")).toBe(p);
  });

  test("listPluginIds returns sorted ids", () => {
    register(fakePlugin("zulu"));
    register(fakePlugin("alpha"));
    register(fakePlugin("mike"));
    expect(listPluginIds()).toEqual(["alpha", "mike", "zulu"]);
  });

  test("re-registering the same id throws (no silent override)", () => {
    register(fakePlugin("alpha"));
    expect(() => register(fakePlugin("alpha"))).toThrow(/already registered/i);
  });

  test("register validates the manifest base schema (rejects empty id)", () => {
    const bad: Plugin<{ n: number }> = {
      manifest: {
        // @ts-expect-error - intentionally bad
        id: "",
        title: "x",
        supportedSkills: ["x"],
        paramSchema: z.object({ n: z.number() }),
      },
      Scene: () => null,
      evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
    };
    expect(() => register(bad)).toThrow();
  });

  test("register requires paramSchema to be a Zod-like object (has .parse)", () => {
    const bad = {
      manifest: { id: "alpha", title: "x", supportedSkills: ["x"], paramSchema: {} as any },
      Scene: () => null,
      evaluate: () => ({ correct: true, expected: 0, isLastStep: true }),
    } as unknown as Plugin<{ n: number }>;
    expect(() => register(bad)).toThrow(/paramSchema/i);
  });
});
