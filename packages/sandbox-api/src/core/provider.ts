import type { Hono } from "hono";
import type { ProviderSettings } from "../config.js";
import type { WebhookRequest } from "./webhooks.js";
import type { PaymentActionName, PaymentRecord, PaymentSummary } from "../domains/payments/model.js";

/** One control action a provider supports on its payments. */
export interface PaymentActionHandler<TData> {
  /** Button label shown in the UI, e.g. "Confirm payment". */
  label: string;
  isAvailable(data: TData): boolean;
  /** Returns the payment's new state and the provider events to send as webhooks, in order. */
  apply(data: TData, ctx: { now: Date; publicUrl: string }): { data: TData; events: string[] };
}

/** What a provider implements for the payments domain. */
export interface PaymentsModule<TData> {
  summarize(data: TData): PaymentSummary;
  actions: Partial<Record<PaymentActionName, PaymentActionHandler<TData>>>;
  /** Builds the provider's real webhook request for an event about this payment. */
  buildWebhook(event: string, data: TData, settings: ProviderSettings): WebhookRequest;
}

/** Payments as one provider sees them: scoped to that provider. */
export interface ProviderPayments<TData> {
  get(id: string): PaymentRecord<TData> | undefined;
  /** Stores the payment and sends a webhook for each event, in order. */
  save(id: string, data: TData, events?: string[]): PaymentRecord<TData>;
}

/** What the sandbox hands a provider when mounting its routes. */
export interface ProviderContext<TData> {
  settings: ProviderSettings;
  publicUrl: string;
  payments: ProviderPayments<TData>;
  /** A named in-memory collection owned by this provider (e.g. customers). Cleared on reset. */
  collection<T>(name: string): Map<string, T>;
}

export interface Provider<TData = any> {
  /** URL-safe id. The provider's API is mounted at `/<id>`, its env vars are prefixed `<ID>_`. */
  id: string;
  displayName: string;
  /** Path under `/<id>` that the app's adapter base URL points at, e.g. "/v3". */
  apiPath: string;
  routes(ctx: ProviderContext<TData>): Hono;
  payments: PaymentsModule<TData>;
}

export const defineProvider = <TData>(provider: Provider<TData>): Provider<TData> => provider;
