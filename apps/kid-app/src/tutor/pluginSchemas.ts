import { listPluginIds, getPlugin } from "@institute/plugin-engine";
import { zodToJsonSchema } from "zod-to-json-schema";

export type AvailablePlugin = {
  id: string;
  title: string;
  supportedSkills: string[];
  paramSchema: unknown;
};

/**
 * Snapshot the registered plugins as JSON-Schema-shaped data the backend can
 * forward to the LLM as a structured-output constraint. Pure read of the
 * registry — call after plugins are registered.
 */
export function getAvailablePlugins(): AvailablePlugin[] {
  return listPluginIds().map((id) => {
    const p = getPlugin(id)!;
    return {
      id: p.manifest.id,
      title: p.manifest.title,
      supportedSkills: [...p.manifest.supportedSkills],
      paramSchema: zodToJsonSchema(p.manifest.paramSchema, { target: "jsonSchema7" }),
    };
  });
}
