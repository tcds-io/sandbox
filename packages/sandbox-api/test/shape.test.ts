import { describe, expect, it } from "vitest";
import { shapeDiff } from "./support/shape.js";

describe("shapeDiff", () => {
  const doc = { id: "x", value: 1, card: null, nested: { a: "b" }, list: [{ k: 1 }] };

  it("accepts a matching shape, with nulls either side", () => {
    expect(shapeDiff({ id: "y", value: 2, card: { n: "1" }, nested: null, list: [] }, [doc])).toEqual([]);
  });

  it("reports missing, invented and mistyped fields", () => {
    expect(shapeDiff({ id: 1, card: null, nested: { a: "b", z: 1 }, list: [{ k: "1" }], extra: true }, [doc])).toEqual([
      "$.value: missing",
      "$.id: expected string, got number",
      "$.nested.z: not in the documented shape",
      "$.list[0].k: expected number, got string",
      "$.extra: not in the documented shape",
    ]);
  });
});
