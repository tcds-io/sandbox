/**
 * Contract tests: each Asaas-compatible endpoint answers with the shape Asaas documents.
 * The documented examples live in fixtures/asaas and are copied from docs.asaas.com.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Sandbox } from "../src/app.js";
import {
  AsaasCustomerListSchema,
  AsaasCustomerSchema,
  AsaasErrorSchema,
  AsaasPaymentSchema,
  AsaasPixQrCodeSchema,
} from "../src/providers/asaas/schemas.js";
import customerDoc from "./fixtures/asaas/customer.json" with { type: "json" };
import customerListDoc from "./fixtures/asaas/customer-list.json" with { type: "json" };
import errorDoc from "./fixtures/asaas/error.json" with { type: "json" };
import paymentDoc from "./fixtures/asaas/payment.json" with { type: "json" };
import webhookDoc from "./fixtures/asaas/payment-webhook.json" with { type: "json" };
import pixDoc from "./fixtures/asaas/pix-qr-code.json" with { type: "json" };
import { API_KEY, dueDate, testSandbox } from "./support/harness.js";
import { shapeDiff } from "./support/shape.js";

/** The payment object is documented by the create example and, for confirmedDate, the webhook example. */
const paymentDocs = [paymentDoc, webhookDoc.payment];

let sandbox: Sandbox;

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await sandbox.app.request(`/asaas/v3${path}`, {
    method,
    headers: { access_token: API_KEY, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

const createCustomer = () => call("POST", "/customers", { name: "John Doe", cpfCnpj: "249.715.637-92", email: "john.doe@asaas.com.br" });

const createPayment = async (overrides: Record<string, unknown> = {}) => {
  const customer = (await createCustomer()).body.id;
  return call("POST", "/payments", {
    customer,
    billingType: "PIX",
    value: 129.9,
    dueDate: dueDate(),
    description: "Pedido 056984",
    externalReference: "order_123",
    ...overrides,
  });
};

const expectError = (res: { status: number; body: unknown }, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(AsaasErrorSchema.parse(res.body).errors[0]!.code).toBe(code);
  expect(shapeDiff(res.body, [errorDoc])).toEqual([]);
};

beforeEach(() => {
  sandbox = testSandbox();
});

describe("auth (access_token header)", () => {
  it("rejects a missing key with 401 access_token_not_found", async () => {
    const res = await sandbox.app.request("/asaas/v3/payments/pay_x");
    expectError({ status: res.status, body: await res.json() }, 401, "access_token_not_found");
  });

  it("rejects a wrong key with 401 invalid_access_token", async () => {
    expectError(await call("GET", "/payments/pay_x", undefined, { access_token: "$aact_hmlg_wrong" }), 401, "invalid_access_token");
  });
});

describe("POST /v3/customers", () => {
  it("returns the documented customer shape", async () => {
    const res = await createCustomer();
    expect(res.status).toBe(200);
    AsaasCustomerSchema.parse(res.body);
    expect(shapeDiff(res.body, [customerDoc])).toEqual([]);
    expect(res.body).toMatchObject({ cpfCnpj: "24971563792", personType: "FISICA" });
  });

  it("rejects an invalid CPF/CNPJ", async () => {
    expectError(await call("POST", "/customers", { name: "John", cpfCnpj: "12345678900" }), 400, "invalid_cpfCnpj");
  });

  it("requires a name", async () => {
    expectError(await call("POST", "/customers", { cpfCnpj: "24971563792" }), 400, "invalid_name");
  });
});

describe("GET /v3/customers", () => {
  it("returns the documented list shape, filtered by cpfCnpj", async () => {
    const created = (await createCustomer()).body;
    await call("POST", "/customers", { name: "Other", cpfCnpj: "11.222.333/0001-81" });

    const res = await call("GET", "/customers?cpfCnpj=24971563792");
    expect(res.status).toBe(200);
    AsaasCustomerListSchema.parse(res.body);
    expect(shapeDiff(res.body, [customerListDoc])).toEqual([]);
    expect(res.body).toMatchObject({ totalCount: 1, hasMore: false, data: [{ id: created.id }] });
  });

  it("returns an empty list when nobody matches", async () => {
    const res = await call("GET", "/customers?cpfCnpj=24971563792");
    expect(res.body).toMatchObject({ object: "list", totalCount: 0, data: [] });
  });
});

describe("POST /v3/payments (PIX)", () => {
  it("creates a PENDING payment with the documented shape", async () => {
    const res = await createPayment();
    expect(res.status).toBe(200);
    AsaasPaymentSchema.parse(res.body);
    expect(shapeDiff(res.body, paymentDocs)).toEqual([]);
    expect(res.body).toMatchObject({ status: "PENDING", billingType: "PIX", value: 129.9, externalReference: "order_123" });
    expect(res.body.id).toMatch(/^pay_/);
  });

  it("rejects an unknown customer", async () => {
    expectError(await call("POST", "/payments", { customer: "cus_nope", billingType: "PIX", value: 10, dueDate: dueDate() }), 400, "invalid_customer");
  });

  it("rejects a due date in the past", async () => {
    expectError(await createPayment({ dueDate: "2020-01-01" }), 400, "invalid_dueDate");
  });

  it("rejects a missing value", async () => {
    expectError(await createPayment({ value: undefined }), 400, "invalid_value");
  });

  it("rejects an unknown billingType", async () => {
    expectError(await createPayment({ billingType: "CASH" }), 400, "invalid_billingType");
  });
});

describe("POST /v3/payments (CREDIT_CARD with creditCardToken)", () => {
  it("answers CONFIRMED in the same call", async () => {
    const res = await createPayment({ billingType: "CREDIT_CARD", creditCardToken: "76496073-536f-4835-80db-c45d00f33695", remoteIp: "203.0.113.7" });
    expect(res.status).toBe(200);
    AsaasPaymentSchema.parse(res.body);
    expect(shapeDiff(res.body, paymentDocs)).toEqual([]);
    expect(res.body).toMatchObject({ status: "CONFIRMED", billingType: "CREDIT_CARD", creditCard: { creditCardToken: "76496073-536f-4835-80db-c45d00f33695" } });
  });

  it("answers a decline with 400 invalid_creditCard and stores nothing", async () => {
    const res = await createPayment({ billingType: "CREDIT_CARD", creditCardToken: "tok_decline", remoteIp: "203.0.113.7" });
    expectError(res, 400, "invalid_creditCard");
    expect(sandbox.payments.list({})).toHaveLength(0);
  });

  it("requires remoteIp", async () => {
    expectError(await createPayment({ billingType: "CREDIT_CARD", creditCardToken: "tok_ok" }), 400, "invalid_remoteIp");
  });
});

describe("GET /v3/payments/{id}", () => {
  it("returns the documented payment shape and the current state", async () => {
    const created = (await createPayment()).body;
    await sandbox.app.request(`/_sandbox/payments/asaas/${created.id}/confirm`, { method: "POST" });

    const res = await call("GET", `/payments/${created.id}`);
    expect(res.status).toBe(200);
    AsaasPaymentSchema.parse(res.body);
    expect(shapeDiff(res.body, paymentDocs)).toEqual([]);
    expect(res.body).toMatchObject({ id: created.id, status: "RECEIVED" });
    expect(res.body.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("answers 404 with the Asaas error envelope for an unknown id", async () => {
    expectError(await call("GET", "/payments/pay_unknown"), 404, "not_found");
  });
});

describe("GET /v3/payments/{id}/pixQrCode", () => {
  it("returns the documented QR code shape, stable across calls", async () => {
    const created = (await createPayment()).body;
    const res = await call("GET", `/payments/${created.id}/pixQrCode`);
    expect(res.status).toBe(200);
    AsaasPixQrCodeSchema.parse(res.body);
    expect(shapeDiff(res.body, [pixDoc])).toEqual([]);
    expect(res.body.payload).toMatch(/^000201.*br\.gov\.bcb\.pix.*6304[0-9A-F]{4}$/);
    expect(Buffer.from(res.body.encodedImage, "base64").subarray(1, 4).toString()).toBe("PNG");
    expect(res.body.expirationDate).toBe(`${created.dueDate} 23:59:59`);

    const again = await call("GET", `/payments/${created.id}/pixQrCode`);
    expect(again.body.payload).toBe(res.body.payload);
  });
});
