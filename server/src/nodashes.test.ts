// server/src/nodashes.test.ts
//
// Guard: no dash in any text the child can hear or read.
//
// The voice engine mangles em/en dashes on short lines and can even switch
// language on them, and the /tts cache then repeats the bad take. Commas and
// full stops cost nothing and cannot break. Comments keep their dashes — only
// string literals are checked.
import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

const ROOT = new URL("../..", import.meta.url).pathname; // repo root
const DASH = /[—–]/;

/** file:line for every string literal that still holds a dash. */
async function offenders(dir: string): Promise<string[]> {
  const found: string[] = [];
  for await (const f of new Glob("**/*.ts").scan({ cwd: `${ROOT}${dir}` })) {
    if (f.endsWith(".test.ts")) continue; // tests quote bad input on purpose
    const src = await Bun.file(`${ROOT}${dir}/${f}`).text();
    src.split("\n").forEach((line, i) => {
      if (/^\s*[*/]/.test(line)) return;             // comment-only line
      const code = line.split("//")[0];              // drop a trailing comment
      for (const m of code.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)) {
        const lit = m[1] ?? m[2] ?? m[3] ?? "";
        if (DASH.test(lit)) found.push(`${dir}/${f}:${i + 1}: ${lit.trim().slice(0, 80)}`);
      }
    });
  }
  return found;
}

describe("no dashes in spoken or on-screen text", () => {
  test("web/src is clean", async () => {
    expect(await offenders("web/src")).toEqual([]);
  });
  test("server/src is clean", async () => {
    expect(await offenders("server/src")).toEqual([]);
  });
});
