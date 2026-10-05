import { randomUUID } from "node:crypto";
import type { ProviderSettings } from "../../config.js";
import { digits, hex } from "../../core/ids.js";
import type { WebhookRequest } from "../../core/webhooks.js";
import { toDateTime } from "./dates.js";
import { WEBHOOK_TOKEN_HEADER, type AsaasPayment, type AsaasPaymentEvent, type AsaasPaymentWebhook } from "./schemas.js";

/** The simulated Asaas account every webhook claims to come from. Stable for one sandbox run. */
const ACCOUNT_ID = randomUUID();

/**
 * Asaas's payment webhook: POST with the event envelope and the full payment object,
 * plus `asaas-access-token` when an auth token is configured.
 */
export function buildPaymentWebhook(event: string, payment: AsaasPayment, settings: ProviderSettings): WebhookRequest {
  const body: AsaasPaymentWebhook = {
    id: `evt_${hex(16)}&${digits(9)}`,
    event: event as AsaasPaymentEvent,
    dateCreated: toDateTime(new Date()),
    account: { id: ACCOUNT_ID, ownerId: null },
    payment,
  };
  const headers: Record<string, string> = {};
  if (settings.webhookToken) headers[WEBHOOK_TOKEN_HEADER] = settings.webhookToken;
  return { headers, body };
}
