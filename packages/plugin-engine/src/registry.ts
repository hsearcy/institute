import { ManifestBaseSchema, type Plugin } from "./contract.ts";

const registry = new Map<string, Plugin<unknown>>();

export function register<P>(plugin: Plugin<P>): void {
  // Validate manifest's base shape (id, title, supportedSkills) via Zod.
  ManifestBaseSchema.parse({
    id: plugin.manifest.id,
    title: plugin.manifest.title,
    supportedSkills: plugin.manifest.supportedSkills,
  });
  // paramSchema must be a Zod-like (has .parse). Structural check.
  if (
    !plugin.manifest.paramSchema ||
    typeof (plugin.manifest.paramSchema as { parse?: unknown }).parse !== "function"
  ) {
    throw new Error(
      `plugin ${plugin.manifest.id}: paramSchema must be a Zod schema (missing .parse)`,
    );
  }
  if (registry.has(plugin.manifest.id)) {
    throw new Error(`plugin ${plugin.manifest.id} already registered`);
  }
  registry.set(plugin.manifest.id, plugin as Plugin<unknown>);
}

export function getPlugin<P = unknown>(id: string): Plugin<P> | undefined {
  return registry.get(id) as Plugin<P> | undefined;
}

export function listPluginIds(): string[] {
  return [...registry.keys()].sort();
}

/** Test-only: wipes the registry. Do not call in app code. */
export function clearRegistry(): void {
  registry.clear();
}
