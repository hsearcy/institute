import { test, expect, describe } from "bun:test";
import { reduce, initial, type AssetEvent } from "../src/world/hooks/useAssets.ts";

describe("useAssets reducer", () => {
  test("initial state is idle", () => {
    expect(initial.status).toBe("idle");
  });

  test("idle → loading on START", () => {
    const next = reduce(initial, { type: "START" });
    expect(next.status).toBe("loading");
  });

  test("loading → ready on COMPLETE", () => {
    const s = reduce(initial, { type: "START" });
    const next = reduce(s, { type: "COMPLETE" });
    expect(next.status).toBe("ready");
  });

  test("loading → error on FAIL with message", () => {
    const s = reduce(initial, { type: "START" });
    const next = reduce(s, { type: "FAIL", message: "boom" });
    expect(next.status).toBe("error");
    if (next.status === "error") expect(next.message).toBe("boom");
  });

  test("ready and error are terminal: COMPLETE/FAIL after them are no-ops", () => {
    const ready = reduce(reduce(initial, { type: "START" }), { type: "COMPLETE" });
    expect(reduce(ready, { type: "COMPLETE" }).status).toBe("ready");
    expect(reduce(ready, { type: "FAIL", message: "x" }).status).toBe("ready");
  });

  test("RESET returns to idle from any state", () => {
    const ready = reduce(reduce(initial, { type: "START" }), { type: "COMPLETE" });
    expect(reduce(ready, { type: "RESET" }).status).toBe("idle");
  });

  test("unknown event types fall through (no throw, returns same state)", () => {
    const evt = { type: "GARBAGE" } as unknown as AssetEvent;
    expect(reduce(initial, evt)).toEqual(initial);
  });
});
