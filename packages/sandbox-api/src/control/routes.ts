import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { SandboxConfig } from "../config.js";
import type { Provider } from "../core/provider.js";
import type { PaymentRecord } from "../domains/payments/model.js";
import type { PaymentsService } from "../domains/payments/service.js";
import {
  PaymentActionNameSchema,
  PaymentDetailSchema,
  PaymentListQuerySchema,
  PaymentListSchema,
  ProviderListSchema,
  WebhookDeliverySchema,
  type ControlError,
} from "./schemas.js";

const send = <S extends z.ZodType>(c: Context, schema: S, body: z.input<S>, status: ContentfulStatusCode = 200) =>
  c.json(schema.parse(body) as object, status);

const fail = (c: Context, status: ContentfulStatusCode, code: string, message: string) =>
  c.json<ControlError>({ error: { code, message } }, status);

/** Routes the front end and automated tests use to inspect and drive the simulated providers. */
export function controlRoutes(deps: {
  providers: readonly Provider[];
  payments: PaymentsService;
  config: SandboxConfig;
  reset: () => void;
}): Hono {
  const { providers, payments, config } = deps;
  const app = new Hono();

  const summary = (record: PaymentRecord) => {
    const { data: _data, ...rest } = record;
    return { ...rest, availableActions: payments.availableActions(record) };
  };

  app.get("/providers", (c) =>
    send(c, ProviderListSchema, {
      data: providers.map((p) => {
        const settings = config.providers[p.id] ?? {};
        return {
          id: p.id,
          displayName: p.displayName,
          domains: ["payments" as const],
          apiBaseUrl: `${config.publicUrl}/${p.id}${p.apiPath}`,
          webhookUrl: settings.webhookUrl ?? null,
          webhookTokenConfigured: Boolean(settings.webhookToken),
          apiKeyRequired: Boolean(settings.apiKey),
        };
      }),
    }),
  );

  app.get("/payments", (c) => {
    const query = PaymentListQuerySchema.safeParse(c.req.query());
    if (!query.success) return fail(c, 400, "invalid_query", query.error.issues[0]?.message ?? "Invalid query.");
    return send(c, PaymentListSchema, { data: payments.list(query.data).map(summary) });
  });

  app.get("/payments/:provider/:id", (c) => {
    const payment = payments.get(c.req.param("provider"), c.req.param("id"));
    if (!payment) return fail(c, 404, "not_found", "Payment not found.");
    return send(c, PaymentDetailSchema, { ...payment, availableActions: payments.availableActions(payment) });
  });

  // One endpoint per action: confirm today; fail, refund, ... slot in by name.
  app.post("/payments/:provider/:id/:action", (c) => {
    const action = PaymentActionNameSchema.safeParse(c.req.param("action"));
    if (!action.success) return fail(c, 404, "unknown_action", `Unknown action "${c.req.param("action")}".`);
    const result = payments.applyAction(c.req.param("provider"), c.req.param("id"), action.data);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "unsupported" ? 400 : 409;
      return fail(c, status, result.reason, result.message);
    }
    return send(c, PaymentDetailSchema, {
      ...result.payment,
      availableActions: payments.availableActions(result.payment),
    });
  });

  app.post("/webhooks/:deliveryId/resend", (c) => {
    const delivery = payments.resendWebhook(c.req.param("deliveryId"));
    if (!delivery) return fail(c, 404, "not_found", "Webhook delivery not found.");
    return send(c, WebhookDeliverySchema, delivery, 202);
  });

  /** Drops all in-memory state. Handy between automated tests. */
  app.post("/reset", (c) => {
    deps.reset();
    return c.body(null, 204);
  });

  return app;
}
