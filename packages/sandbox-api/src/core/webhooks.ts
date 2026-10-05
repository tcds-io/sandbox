import { hex } from "./ids.js";

export interface WebhookAttempt {
  at: string;
  /** HTTP status the target answered with; null when the request itself failed. */
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

export interface WebhookDelivery {
  id: string;
  provider: string;
  /** The provider's event name, e.g. PAYMENT_RECEIVED. */
  event: string;
  /** Domain resource the event is about. */
  resource: { domain: string; id: string };
  /** Set when this delivery is a manual resend of another one. */
  resendOf: string | null;
  url: string | null;
  request: { headers: Record<string, string>; body: unknown };
  status: WebhookDeliveryStatus;
  attempts: WebhookAttempt[];
  createdAt: string;
  updatedAt: string;
}

export interface WebhookRequest {
  headers: Record<string, string>;
  body: unknown;
}

export interface DispatcherOptions {
  maxAttempts: number;
  retryBaseMs: number;
  timeoutMs: number;
}

/**
 * Sends webhooks and keeps a log of every delivery. Each delivery is retried with
 * exponential backoff (retryBaseMs, 2x, 4x, ...) until it gets a 2xx or runs out of attempts.
 */
export class WebhookDispatcher {
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly inFlight = new Set<Promise<void>>();
  /** Pending retries, with the resolver that releases their in-flight promise. */
  private readonly timers = new Map<NodeJS.Timeout, () => void>();

  constructor(private readonly options: DispatcherOptions) {}

  send(input: {
    provider: string;
    event: string;
    resource: { domain: string; id: string };
    url: string | undefined;
    request: WebhookRequest;
    resendOf?: string;
  }): WebhookDelivery {
    const now = new Date().toISOString();
    const delivery: WebhookDelivery = {
      id: `whd_${hex(8)}`,
      provider: input.provider,
      event: input.event,
      resource: input.resource,
      resendOf: input.resendOf ?? null,
      url: input.url ?? null,
      request: { headers: { "content-type": "application/json", ...input.request.headers }, body: input.request.body },
      status: input.url ? "pending" : "skipped",
      attempts: [],
      createdAt: now,
      updatedAt: now,
    };
    this.deliveries.set(delivery.id, delivery);
    if (input.url) this.track(this.attempt(delivery));
    return delivery;
  }

  /** Sends the exact same request again as a new delivery. */
  resend(deliveryId: string, url: string | undefined): WebhookDelivery | undefined {
    const original = this.deliveries.get(deliveryId);
    if (!original) return undefined;
    return this.send({
      provider: original.provider,
      event: original.event,
      resource: original.resource,
      url: url ?? original.url ?? undefined,
      request: original.request,
      resendOf: original.id,
    });
  }

  get(id: string): WebhookDelivery | undefined {
    return this.deliveries.get(id);
  }

  listFor(provider: string, domain: string, resourceId: string): WebhookDelivery[] {
    return [...this.deliveries.values()].filter(
      (d) => d.provider === provider && d.resource.domain === domain && d.resource.id === resourceId,
    );
  }

  /** Resolves once no delivery is in flight or waiting for a retry. Meant for tests. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  clear(): void {
    for (const [timer, release] of this.timers) {
      clearTimeout(timer);
      release();
    }
    this.timers.clear();
    this.deliveries.clear();
  }

  private track(promise: Promise<void>): void {
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }

  private async attempt(delivery: WebhookDelivery): Promise<void> {
    const started = Date.now();
    const attempt: WebhookAttempt = {
      at: new Date(started).toISOString(),
      responseStatus: null,
      responseBody: null,
      error: null,
      durationMs: 0,
    };
    try {
      const response = await fetch(delivery.url!, {
        method: "POST",
        headers: delivery.request.headers,
        body: JSON.stringify(delivery.request.body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      attempt.responseStatus = response.status;
      attempt.responseBody = (await response.text()).slice(0, 2000);
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
    }
    attempt.durationMs = Date.now() - started;
    delivery.attempts.push(attempt);
    delivery.updatedAt = new Date().toISOString();

    const ok = attempt.responseStatus !== null && attempt.responseStatus >= 200 && attempt.responseStatus < 300;
    if (ok) {
      delivery.status = "delivered";
    } else if (delivery.attempts.length >= this.options.maxAttempts) {
      delivery.status = "failed";
    } else if (this.deliveries.has(delivery.id)) {
      const delay = this.options.retryBaseMs * 2 ** (delivery.attempts.length - 1);
      this.track(
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            this.timers.delete(timer);
            void this.attempt(delivery).finally(resolve);
          }, delay);
          this.timers.set(timer, resolve);
        }),
      );
    }
  }
}
