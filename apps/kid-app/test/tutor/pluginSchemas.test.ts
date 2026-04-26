import { describe, test, expect } from "vitest";
import { register, clearRegistry } from "@institute/plugin-engine";
import { z } from "zod";
import { getAvailablePlugins } from "../../src/tutor/pluginSchemas";

describe("getAvailablePlugins", () => {
  test("returns id, title, supportedSkills, paramSchema (as JSON Schema) for one plugin", () => {
    clearRegistry();

    // Mock plugin to avoid Babel parsing issues with spell-cast's TypeScript generics
    const mockParamSchema = z.object({
      enemyType: z.enum(["goblin", "slime", "ghost"]),
      sequence: z.array(z.number().int().nonnegative()).nonempty(),
      intro: z.string().min(1),
    });

    const mockPlugin = {
      manifest: {
        id: "spell-cast",
        title: "Spell Cast",
        supportedSkills: ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
        paramSchema: mockParamSchema,
      },
      Scene: () => null,
      evaluate: () => ({ score: 0 }),
    };

    register(mockPlugin);

    const list = getAvailablePlugins();
    expect(list).toHaveLength(1);
    const p = list[0]!;
    expect(p.id).toBe("spell-cast");
    expect(p.title).toBe("Spell Cast");
    expect(p.supportedSkills).toEqual(expect.arrayContaining(["skip_count_2"]));

    const schema = p.paramSchema as Record<string, any>;
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["enemyType", "sequence", "intro"]));
    expect(schema.required).toEqual(expect.arrayContaining(["enemyType", "sequence", "intro"]));
  });

  test("returns [] when no plugins registered", () => {
    clearRegistry();
    expect(getAvailablePlugins()).toEqual([]);
  });
});
