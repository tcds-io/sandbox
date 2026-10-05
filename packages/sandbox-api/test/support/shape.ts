type Kind = "null" | "string" | "number" | "boolean" | "array" | "object";

const kindOf = (v: unknown): Kind =>
  v === null || v === undefined ? "null" : Array.isArray(v) ? "array" : (typeof v as Kind);

const isObject = (v: unknown): v is Record<string, unknown> => kindOf(v) === "object";

/**
 * Lists every difference between `actual`'s shape and the documented examples.
 * - Every key of the first (primary) example must be present.
 * - Every key of `actual` must appear in at least one example (no invented fields).
 * - Values must have the same JSON type; null on either side is accepted (nullable field).
 */
export function shapeDiff(actual: unknown, documented: unknown[], path = "$"): string[] {
  const docs = documented.filter((d) => kindOf(d) !== "null");
  if (kindOf(actual) === "null" || docs.length === 0) return [];

  const kinds = new Set(docs.map(kindOf));
  if (!kinds.has(kindOf(actual))) return [`${path}: expected ${[...kinds].join("|")}, got ${kindOf(actual)}`];

  if (isObject(actual)) {
    const objects = docs.filter(isObject);
    const primary = objects[0] ?? {};
    const known = new Set(objects.flatMap((o) => Object.keys(o)));
    const diffs: string[] = [];
    for (const key of Object.keys(primary)) if (!(key in actual)) diffs.push(`${path}.${key}: missing`);
    for (const key of Object.keys(actual)) {
      if (!known.has(key)) diffs.push(`${path}.${key}: not in the documented shape`);
      else diffs.push(...shapeDiff(actual[key], objects.map((o) => o[key]), `${path}.${key}`));
    }
    return diffs;
  }

  if (Array.isArray(actual)) {
    const items = docs.flatMap((d) => (Array.isArray(d) ? d : []));
    return actual.flatMap((item, i) => shapeDiff(item, items, `${path}[${i}]`));
  }

  return [];
}
