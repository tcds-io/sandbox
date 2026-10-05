import { z } from "zod";

/** Settings one simulated provider reads from the environment. */
export interface ProviderSettings {
  /** The API key the provider-compatible endpoints accept. Unset: any non-empty key. */
  apiKey?: string;
  /** Where the provider's webhooks are POSTed. Unset: deliveries are recorded as skipped. */
  webhookUrl?: string;
  /** The token sent in the provider's webhook auth header. */
  webhookToken?: string;
}

export interface SandboxConfig {
  port: number;
  /** Origin the sandbox is reachable at, used to build links such as invoice URLs. */
  publicUrl: string;
  webhook: {
    maxAttempts: number;
    retryBaseMs: number;
    timeoutMs: number;
  };
  /** Per-provider settings, keyed by provider id. */
  providers: Record<string, ProviderSettings>;
}

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const intFrom = (fallback: number) => z.coerce.number().int().positive().default(fallback);

/**
 * Reads the configuration. Provider settings are looked up generically as
 * `<PROVIDER_ID>_API_KEY`, `<PROVIDER_ID>_WEBHOOK_URL` and `<PROVIDER_ID>_WEBHOOK_TOKEN`,
 * so adding a provider needs no change here.
 */
export function loadConfig(
  providerIds: readonly string[],
  env: Record<string, string | undefined> = process.env,
): SandboxConfig {
  const port = intFrom(4000).parse(env.PORT);
  const providers: Record<string, ProviderSettings> = {};
  for (const id of providerIds) {
    const prefix = id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    providers[id] = {
      apiKey: optional.parse(env[`${prefix}_API_KEY`]),
      webhookUrl: optional.parse(env[`${prefix}_WEBHOOK_URL`]),
      webhookToken: optional.parse(env[`${prefix}_WEBHOOK_TOKEN`]),
    };
  }
  return {
    port,
    publicUrl: (optional.parse(env.PUBLIC_URL) ?? `http://localhost:${port}`).replace(/\/$/, ""),
    webhook: {
      maxAttempts: intFrom(4).parse(env.WEBHOOK_MAX_ATTEMPTS),
      retryBaseMs: intFrom(1000).parse(env.WEBHOOK_RETRY_BASE_MS),
      timeoutMs: intFrom(5000).parse(env.WEBHOOK_TIMEOUT_MS),
    },
    providers,
  };
}
