import { randomBytes } from "node:crypto";

/** Random lowercase hex string of `bytes * 2` characters. */
export const hex = (bytes: number): string => randomBytes(bytes).toString("hex");

/** Random digits string of the given length. */
export const digits = (length: number): string =>
  Array.from(randomBytes(length), (b) => (b % 10).toString()).join("");
