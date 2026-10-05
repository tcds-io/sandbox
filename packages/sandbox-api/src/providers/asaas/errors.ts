import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { AsaasError } from "./schemas.js";

/** Asaas's error envelope: `{ "errors": [{ "code", "description" }] }`. */
export const asaasError = (c: Context, status: ContentfulStatusCode, code: string, description: string) =>
  c.json<AsaasError>({ errors: [{ code, description }] }, status);

/** Turns the first Zod issue into Asaas's `invalid_<field>` error. */
export const validationError = (c: Context, error: z.ZodError) => {
  const issue = error.issues[0];
  const field = issue?.path[0];
  const code = typeof field === "string" ? `invalid_${field}` : "invalid_object";
  return asaasError(c, 400, code, issue?.message ?? "Requisição inválida.");
};

export const notFound = (c: Context) =>
  asaasError(c, 404, "not_found", "O recurso solicitado não foi encontrado.");
