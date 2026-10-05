/**
 * Control API schemas (`/_sandbox/...`). The front end imports these types,
 * so they describe the wire format and stay provider-neutral.
 */
import { z } from "zod";
import { PAYMENT_ACTIONS } from "../domains/payments/model.js";

export const PaymentOutcomeSchema = z.enum(["pending", "paid", "failed", "other"]);
export const PaymentActionNameSchema = z.enum(PAYMENT_ACTIONS);

export const ProviderInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  domains: z.array(z.literal("payments")),
  /** Base URL to point the app's adapter at. */
  apiBaseUrl: z.string(),
  webhookUrl: z.string().nullable(),
  webhookTokenConfigured: z.boolean(),
  apiKeyRequired: z.boolean(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;
export const ProviderListSchema = z.object({ data: z.array(ProviderInfoSchema) });

export const WebhookAttemptSchema = z.object({
  at: z.string(),
  responseStatus: z.number().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number(),
});

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  provider: z.string(),
  event: z.string(),
  resource: z.object({ domain: z.string(), id: z.string() }),
  resendOf: z.string().nullable(),
  url: z.string().nullable(),
  request: z.object({ headers: z.record(z.string(), z.string()), body: z.unknown() }),
  status: z.enum(["pending", "delivered", "failed", "skipped"]),
  attempts: z.array(WebhookAttemptSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

export const PaymentActionSchema = z.object({ name: PaymentActionNameSchema, label: z.string() });

export const PaymentSchema = z.object({
  provider: z.string(),
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  method: z.string(),
  status: z.string(),
  outcome: PaymentOutcomeSchema,
  externalReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  availableActions: z.array(PaymentActionSchema),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const PaymentDetailSchema = PaymentSchema.extend({
  /** The provider-native payment, as the provider API returns it. */
  data: z.unknown(),
  webhookDeliveries: z.array(WebhookDeliverySchema),
});
export type PaymentDetail = z.infer<typeof PaymentDetailSchema>;

export const PaymentListQuerySchema = z.object({
  provider: z.string().optional(),
  status: z.string().optional(),
  outcome: PaymentOutcomeSchema.optional(),
});

export const PaymentListSchema = z.object({ data: z.array(PaymentSchema) });

export const ControlErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ControlError = z.infer<typeof ControlErrorSchema>;
