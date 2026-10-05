import type { WebhookDelivery } from "../../core/webhooks.js";

/**
 * Provider-neutral reading of a payment's status, used to group and color payments.
 * The provider's own status string is always kept alongside it.
 */
export type PaymentOutcome = "pending" | "paid" | "failed" | "other";

/**
 * Actions a person or a test can take on a payment through the control API.
 * Later actions (fail, refund, ...) are added here and implemented per provider.
 */
export const PAYMENT_ACTIONS = ["confirm", "expire"] as const;
export type PaymentActionName = (typeof PAYMENT_ACTIONS)[number];

/** The fields every provider's payment is summarized into. */
export interface PaymentSummary {
  amount: number;
  currency: string;
  /** Provider's method name, e.g. PIX or CREDIT_CARD. */
  method: string;
  /** Provider's own status value, e.g. PENDING or RECEIVED. */
  status: string;
  outcome: PaymentOutcome;
  /** The id the app under test gave the payment, when the provider supports one. */
  externalReference: string | null;
}

export interface PaymentRecord<TData = unknown> extends PaymentSummary {
  provider: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  /** The provider-native resource, exactly as the provider API returns it. */
  data: TData;
}

export interface PaymentWithDeliveries extends PaymentRecord {
  webhookDeliveries: WebhookDelivery[];
}
