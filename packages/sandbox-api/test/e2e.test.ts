/**
 * End to end: the app under test creates a payment through the Asaas-compatible API,
 * a person (here, the test) confirms it through the control API, and the app's webhook
 * endpoint receives Asaas's real PAYMENT_RECEIVED payload.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AsaasPaymentWebhookSchema } from "../src/providers/asaas/schemas.js";
import webhookDoc from "./fixtures/asaas/payment-webhook.json" with { type: "json" };
import paymentDoc from "./fixtures/asaas/payment.json" with { type: "json" };
import { API_KEY, WEBHOOK_TOKEN, WebhookReceiver, dueDate, startSandbox } from "./support/harness.js";
import { shapeDiff } from "./support/shape.js";

let receiver: WebhookReceiver;
let env: Awaited<ReturnType<typeof startSandbox>>;

const asaas = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${env.baseUrl}/asaas/v3${path}`, {
    method,
    headers: { access_token: API_KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

const control = async (method: string, path: string) => {
  const res = await fetch(`${env.baseUrl}/_sandbox${path}`, { method });
  return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) };
};

/** The lookup-or-create flow an Asaas adapter runs before charging. */
async function customerId(): Promise<string> {
  const found = await asaas("GET", "/customers?cpfCnpj=24971563792");
  if (found.body.data.length > 0) return found.body.data[0].id;
  return (await asaas("POST", "/customers", { name: "John Doe", cpfCnpj: "24971563792" })).body.id;
}

const expectRealWebhook = (body: unknown) => {
  AsaasPaymentWebhookSchema.parse(body);
  const { payment, ...envelope } = body as { payment: unknown };
  const { payment: docPayment, ...docEnvelope } = webhookDoc;
  expect(shapeDiff(envelope, [docEnvelope])).toEqual([]);
  expect(shapeDiff(payment, [paymentDoc, docPayment])).toEqual([]);
};

beforeEach(async () => {
  receiver = new WebhookReceiver();
  const url = await receiver.start();
  env = await startSandbox({ ASAAS_WEBHOOK_URL: url });
});

afterEach(async () => {
  await env.stop();
  await receiver.stop();
});

describe("Pix payment confirmed through the control API", () => {
  it("delivers PAYMENT_RECEIVED with Asaas's real payload and auth header", async () => {
    const customer = await customerId();
    const created = await asaas("POST", "/payments", {
      customer,
      billingType: "PIX",
      value: 49.9,
      dueDate: dueDate(),
      externalReference: "po_8f2c",
    });
    expect(created.body.status).toBe("PENDING");

    const qr = await asaas("GET", `/payments/${created.body.id}/pixQrCode`);
    expect(qr.status).toBe(200);

    const pending = await control("GET", `/payments?provider=asaas&status=PENDING`);
    expect(pending.body.data.map((p: any) => p.id)).toEqual([created.body.id]);
    expect(pending.body.data[0].availableActions.map((a: any) => a.name)).toContain("confirm");

    const confirmed = await control("POST", `/payments/asaas/${created.body.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ status: "RECEIVED", outcome: "paid" });

    const webhook = await receiver.waitFor((w) => w.body.event === "PAYMENT_RECEIVED");
    expect(webhook.headers["asaas-access-token"]).toBe(WEBHOOK_TOKEN);
    expect(webhook.headers["content-type"]).toBe("application/json");
    expectRealWebhook(webhook.body);
    expect(webhook.body.payment).toMatchObject({
      id: created.body.id,
      status: "RECEIVED",
      externalReference: "po_8f2c",
      value: 49.9,
    });

    // The trust step: reading the payment back reports the new status.
    expect((await asaas("GET", `/payments/${created.body.id}`)).body.status).toBe("RECEIVED");

    await env.sandbox.webhooks.idle();
    const detail = await control("GET", `/payments/asaas/${created.body.id}`);
    expect(detail.body.webhookDeliveries.map((d: any) => [d.event, d.status])).toEqual([
      ["PAYMENT_CREATED", "delivered"],
      ["PAYMENT_RECEIVED", "delivered"],
    ]);
    expect(detail.body.webhookDeliveries[1].attempts[0].responseStatus).toBe(200);

    // Confirming twice is refused.
    expect((await control("POST", `/payments/asaas/${created.body.id}/confirm`)).status).toBe(409);
  });

  it("marks a Pix payment overdue and sends PAYMENT_OVERDUE", async () => {
    const created = await asaas("POST", "/payments", { customer: await customerId(), billingType: "PIX", value: 10, dueDate: dueDate() });
    const expired = await control("POST", `/payments/asaas/${created.body.id}/expire`);
    expect(expired.body).toMatchObject({ status: "OVERDUE", outcome: "failed" });
    const webhook = await receiver.waitFor((w) => w.body.event === "PAYMENT_OVERDUE");
    expectRealWebhook(webhook.body);
    expect(webhook.body.payment.status).toBe("OVERDUE");
  });
});

describe("card payment", () => {
  it("is confirmed in the create call and sends PAYMENT_CONFIRMED", async () => {
    const created = await asaas("POST", "/payments", {
      customer: await customerId(),
      billingType: "CREDIT_CARD",
      value: 120,
      dueDate: dueDate(0),
      creditCardToken: "76496073-536f-4835-80db-c45d00f33695",
      remoteIp: "203.0.113.7",
    });
    expect(created.body.status).toBe("CONFIRMED");
    const webhook = await receiver.waitFor((w) => w.body.event === "PAYMENT_CONFIRMED");
    expectRealWebhook(webhook.body);
    expect(webhook.body.payment).toMatchObject({ id: created.body.id, status: "CONFIRMED", billingType: "CREDIT_CARD" });
  });
});

describe("webhook delivery", () => {
  it("retries a failed delivery with backoff until the receiver accepts it", async () => {
    receiver.respondWith = [500, 503];
    const created = await asaas("POST", "/payments", { customer: await customerId(), billingType: "PIX", value: 10, dueDate: dueDate() });
    await env.sandbox.webhooks.idle();

    const [delivery] = (await control("GET", `/payments/asaas/${created.body.id}`)).body.webhookDeliveries;
    expect(delivery.status).toBe("delivered");
    expect(delivery.attempts.map((a: any) => a.responseStatus)).toEqual([500, 503, 200]);
    expect(receiver.received).toHaveLength(3);
  });

  it("gives up after the configured attempts", async () => {
    receiver.respondWith = [500, 500, 500, 500];
    const created = await asaas("POST", "/payments", { customer: await customerId(), billingType: "PIX", value: 10, dueDate: dueDate() });
    await env.sandbox.webhooks.idle();
    const [delivery] = (await control("GET", `/payments/asaas/${created.body.id}`)).body.webhookDeliveries;
    expect(delivery).toMatchObject({ status: "failed" });
    expect(delivery.attempts).toHaveLength(4);
  });

  it("resends a delivery on request, with the same event", async () => {
    const created = await asaas("POST", "/payments", { customer: await customerId(), billingType: "PIX", value: 10, dueDate: dueDate() });
    await control("POST", `/payments/asaas/${created.body.id}/confirm`);
    await env.sandbox.webhooks.idle();
    const original = (await control("GET", `/payments/asaas/${created.body.id}`)).body.webhookDeliveries[1];

    const resent = await control("POST", `/webhooks/${original.id}/resend`);
    expect(resent.status).toBe(202);
    expect(resent.body).toMatchObject({ resendOf: original.id, event: "PAYMENT_RECEIVED" });
    await env.sandbox.webhooks.idle();

    const received = receiver.received.filter((w) => w.body.event === "PAYMENT_RECEIVED");
    expect(received).toHaveLength(2);
    expect(received[1]!.body).toEqual(received[0]!.body);
  });
});

describe("control API", () => {
  it("lists only simulated providers", async () => {
    const res = await control("GET", "/providers");
    expect(res.body.data.map((p: any) => p.id)).toEqual(["asaas"]);
    expect(res.body.data[0].apiBaseUrl).toBe("http://sandbox.test/asaas/v3");
  });

  it("refuses unknown actions and payments", async () => {
    expect((await control("POST", "/payments/asaas/pay_x/refund")).status).toBe(404);
    expect((await control("POST", "/payments/asaas/pay_x/confirm")).status).toBe(404);
  });

  it("resets all state", async () => {
    await asaas("POST", "/payments", { customer: await customerId(), billingType: "PIX", value: 10, dueDate: dueDate() });
    expect((await control("POST", "/reset")).status).toBe(204);
    expect((await control("GET", "/payments")).body.data).toEqual([]);
    expect((await asaas("GET", "/customers")).body.totalCount).toBe(0);
  });
});
