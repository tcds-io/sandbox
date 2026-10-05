import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SandboxConfig } from "./config.js";
import { controlRoutes } from "./control/routes.js";
import type { Provider } from "./core/provider.js";
import { WebhookDispatcher } from "./core/webhooks.js";
import { PaymentsService } from "./domains/payments/service.js";
import { PaymentStore } from "./domains/payments/store.js";

export interface Sandbox {
  app: Hono;
  webhooks: WebhookDispatcher;
  payments: PaymentsService;
  reset(): void;
}

/** Wires the providers, the in-memory state and the control API into one HTTP app. */
export function createSandbox(config: SandboxConfig, providers: readonly Provider[]): Sandbox {
  const store = new PaymentStore();
  const webhooks = new WebhookDispatcher(config.webhook);
  const byId = new Map(providers.map((p) => [p.id, p]));
  const payments = new PaymentsService(byId, store, webhooks, config);
  const collections: Map<string, unknown>[] = [];

  const reset = () => {
    store.clear();
    webhooks.clear();
    for (const collection of collections) collection.clear();
  };

  const app = new Hono();
  app.use("/_sandbox/*", cors());
  app.get("/health", (c) => c.json({ status: "ok", providers: providers.map((p) => p.id) }));
  app.route("/_sandbox", controlRoutes({ providers, payments, config, reset }));

  for (const provider of providers) {
    const named = new Map<string, Map<string, unknown>>();
    app.route(
      `/${provider.id}`,
      provider.routes({
        settings: config.providers[provider.id] ?? {},
        publicUrl: config.publicUrl,
        payments: payments.forProvider(provider.id),
        collection: <T>(name: string) => {
          let collection = named.get(name);
          if (!collection) {
            collection = new Map<string, unknown>();
            named.set(name, collection);
            collections.push(collection);
          }
          return collection as Map<string, T>;
        },
      }),
    );
  }

  return { app, webhooks, payments, reset };
}
