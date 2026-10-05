import { Hono, type Context } from "hono";
import type { z } from "zod";
import type { ProviderContext } from "../../core/provider.js";
import { toDate } from "./dates.js";
import { parseCpfCnpj, onlyDigits } from "./documents.js";
import { asaasError, notFound, validationError } from "./errors.js";
import { confirmCard, newCustomerId, newPaymentId, toCustomer, toPayment } from "./mappers.js";
import { buildPixImage, buildPixPayload } from "./pix.js";
import {
  API_KEY_HEADER,
  AsaasCustomerListSchema,
  AsaasCustomerSchema,
  AsaasPaymentSchema,
  AsaasPixQrCodeSchema,
  CreateCustomerRequestSchema,
  CreatePaymentRequestSchema,
  ListCustomersQuerySchema,
  type AsaasCustomer,
  type AsaasPayment,
} from "./schemas.js";

/** A card token containing this marker is declined, so tests can exercise the decline path. */
export const DECLINE_TOKEN_MARKER = "decline";

const DECLINED_DESCRIPTION =
  "Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.";

/** Validates outgoing bodies too, so the sandbox can never drift from the documented shape. */
const send = <S extends z.ZodType>(c: Context, schema: S, body: z.infer<S>) => c.json(schema.parse(body) as object);

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function asaasRoutes(ctx: ProviderContext<AsaasPayment>): Hono {
  const customers = ctx.collection<AsaasCustomer>("customers");
  const pixPayloads = ctx.collection<string>("pixPayloads");
  let invoiceSeq = 5100;

  const app = new Hono();

  // Asaas authenticates every call with the `access_token` header.
  app.use("/v3/*", async (c, next) => {
    const key = c.req.header(API_KEY_HEADER);
    if (!key) {
      return asaasError(
        c,
        401,
        "access_token_not_found",
        "The authentication header 'access_token' is required and was not found in the request",
      );
    }
    if (ctx.settings.apiKey && key !== ctx.settings.apiKey) {
      return asaasError(c, 401, "invalid_access_token", "The provided API key is invalid");
    }
    await next();
  });

  // ------------------------------------------------------------ customers

  app.post("/v3/customers", async (c) => {
    const parsed = CreateCustomerRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return validationError(c, parsed.error);
    const doc = parseCpfCnpj(parsed.data.cpfCnpj);
    if (!doc) return asaasError(c, 400, "invalid_cpfCnpj", "O CPF/CNPJ informado é inválido.");
    const customer = toCustomer(newCustomerId(), parsed.data, doc, new Date());
    customers.set(customer.id, customer);
    return send(c, AsaasCustomerSchema, customer);
  });

  app.get("/v3/customers", (c) => {
    const parsed = ListCustomersQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return validationError(c, parsed.error);
    const q = parsed.data;
    const matches = [...customers.values()].filter(
      (cus) =>
        !cus.deleted &&
        (!q.cpfCnpj || cus.cpfCnpj === onlyDigits(q.cpfCnpj)) &&
        (!q.email || cus.email === q.email) &&
        (!q.externalReference || cus.externalReference === q.externalReference) &&
        (!q.name || cus.name.toLowerCase().includes(q.name.toLowerCase())),
    );
    const data = matches.slice(q.offset, q.offset + q.limit);
    return send(c, AsaasCustomerListSchema, {
      object: "list",
      hasMore: q.offset + data.length < matches.length,
      totalCount: matches.length,
      limit: q.limit,
      offset: q.offset,
      data,
    });
  });

  app.get("/v3/customers/:id", (c) => {
    const customer = customers.get(c.req.param("id"));
    return customer ? send(c, AsaasCustomerSchema, customer) : notFound(c);
  });

  // ------------------------------------------------------------ payments

  app.post("/v3/payments", async (c) => {
    const parsed = CreatePaymentRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return validationError(c, parsed.error);
    const req = parsed.data;
    const now = new Date();

    if (!customers.has(req.customer)) {
      return asaasError(c, 400, "invalid_customer", "Customer Inválido ou não informado");
    }
    if (req.dueDate < toDate(now)) {
      return asaasError(c, 400, "invalid_dueDate", "Não é permitido data de vencimento inferior a hoje.");
    }

    const id = newPaymentId();
    const payment = toPayment(id, req, { publicUrl: ctx.publicUrl, invoiceNumber: String(++invoiceSeq).padStart(8, "0"), now });

    // A card charged with a token is answered in the same call: CONFIRMED, or an error when declined.
    // Without a token, Asaas creates a PENDING charge the customer pays on the invoice page.
    if (req.billingType === "CREDIT_CARD" && req.creditCardToken) {
      if (!req.remoteIp) {
        return asaasError(c, 400, "invalid_remoteIp", "O IP de onde o cliente está fazendo a compra deve ser informado.");
      }
      if (req.creditCardToken.toLowerCase().includes(DECLINE_TOKEN_MARKER)) {
        return asaasError(c, 400, "invalid_creditCard", DECLINED_DESCRIPTION);
      }
      const card = { creditCardNumber: "8829", creditCardBrand: "VISA", creditCardToken: req.creditCardToken };
      const confirmed = confirmCard(payment, card, now, ctx.publicUrl);
      ctx.payments.save(id, confirmed, ["PAYMENT_CREATED", "PAYMENT_CONFIRMED"]);
      return send(c, AsaasPaymentSchema, confirmed);
    }

    ctx.payments.save(id, payment, ["PAYMENT_CREATED"]);
    return send(c, AsaasPaymentSchema, payment);
  });

  app.get("/v3/payments/:id", (c) => {
    const record = ctx.payments.get(c.req.param("id"));
    return record ? send(c, AsaasPaymentSchema, record.data) : notFound(c);
  });

  app.get("/v3/payments/:id/pixQrCode", async (c) => {
    const record = ctx.payments.get(c.req.param("id"));
    if (!record) return notFound(c);
    const payment = record.data;
    if (payment.billingType === "CREDIT_CARD") {
      return asaasError(c, 400, "invalid_billingType", "Não é possível gerar QR Code Pix para cobranças de cartão de crédito.");
    }
    let payload = pixPayloads.get(payment.id);
    if (!payload) {
      payload = buildPixPayload(payment.value);
      pixPayloads.set(payment.id, payload);
    }
    return send(c, AsaasPixQrCodeSchema, {
      encodedImage: await buildPixImage(payload),
      payload,
      expirationDate: `${payment.dueDate} 23:59:59`,
      description: payment.description,
    });
  });

  app.all("/v3/*", (c) => notFound(c));

  return app;
}
