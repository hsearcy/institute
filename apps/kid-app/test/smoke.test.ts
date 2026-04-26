import { test, expect } from "bun:test";

test("smoke: bun test runs in kid-app", () => {
  expect(1 + 1).toBe(2);
});
