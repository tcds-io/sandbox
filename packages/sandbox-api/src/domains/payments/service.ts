import type { SandboxConfig } from "../../config.js";
import type { Provider, ProviderPayments } from "../../core/provider.js";
import type { WebhookDelivery, WebhookDispatcher } from "../../core/webhooks.js";
import type { PaymentActionName, PaymentRecord, PaymentWithDeliveries } from "./model.js";
import type { PaymentStore } from "./store.js";

const DOMAIN = "payments";

export type ActionResult =
  | { ok: true; payment: PaymentWithDeliveries }
  | { ok: false; reason: "not_found" | "unsupported" | "unavailable"; message: string };

/** Payment state changes and the webhooks that follow them, for every provider. */
export class PaymentsService {
  constructor(
    private readonly providers: ReadonlyMap<string, Provider>,
    private readonly store: PaymentStore,
    private readonly webhooks: WebhookDispatcher,
    private readonly config: SandboxConfig,
  ) {}

  /** The payments view handed to one provider's routes. */
  forProvider<TData>(providerId: string): ProviderPayments<TData> {
    return {
      get: (id) => this.store.get<TData>(providerId, id),
      save: (id, data, events = []) => {
        const record = this.store.put(providerId, id, data, this.provider(providerId).payments.summarize(data));
        for (const event of events) this.emit(record, event);
        return record;
      },
    };
  }

  list(filter: Parameters<PaymentStore["list"]>[0]): PaymentRecord[] {
    return this.store.list(filter);
  }

  get(providerId: string, id: string): PaymentWithDeliveries | undefined {
    const record = this.store.get(providerId, id);
    return record && this.withDeliveries(record);
  }

  availableActions(record: PaymentRecord): { name: PaymentActionName; label: string }[] {
    const provider = this.providers.get(record.provider);
    if (!provider) return [];
    return Object.entries(provider.payments.actions)
      .filter(([, handler]) => handler.isAvailable(record.data))
      .map(([name, handler]) => ({ name: name as PaymentActionName, label: handler.label }));
  }

  applyAction(providerId: string, id: string, action: PaymentActionName): ActionResult {
    const provider = this.providers.get(providerId);
    const record = this.store.get(providerId, id);
    if (!provider || !record) return { ok: false, reason: "not_found", message: "Payment not found." };
    const handler = provider.payments.actions[action];
    if (!handler) {
      return { ok: false, reason: "unsupported", message: `${provider.displayName} does not support "${action}".` };
    }
    if (!handler.isAvailable(record.data)) {
      return {
        ok: false,
        reason: "unavailable",
        message: `Cannot ${action} a payment in status ${record.status}.`,
      };
    }
    const { data, events } = handler.apply(record.data, { now: new Date(), publicUrl: this.config.publicUrl });
    this.forProvider(providerId).save(id, data, events);
    return { ok: true, payment: this.get(providerId, id)! };
  }

  resendWebhook(deliveryId: string): WebhookDelivery | undefined {
    const original = this.webhooks.get(deliveryId);
    if (!original || original.resource.domain !== DOMAIN) return undefined;
    return this.webhooks.resend(deliveryId, this.config.providers[original.provider]?.webhookUrl);
  }

  private emit(record: PaymentRecord, event: string): void {
    const settings = this.config.providers[record.provider] ?? {};
    this.webhooks.send({
      provider: record.provider,
      event,
      resource: { domain: DOMAIN, id: record.id },
      url: settings.webhookUrl,
      request: this.provider(record.provider).payments.buildWebhook(event, record.data, settings),
    });
  }

  private withDeliveries(record: PaymentRecord): PaymentWithDeliveries {
    return { ...record, webhookDeliveries: this.webhooks.listFor(record.provider, DOMAIN, record.id) };
  }

  private provider(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }
}
