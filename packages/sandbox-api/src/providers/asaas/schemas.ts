/**
 * Asaas API v3 request and response shapes.
 * Source: https://docs.asaas.com/reference (Cobranças, Clientes, Pix QR Code, Webhooks).
 */
import { z } from "zod";

export const BILLING_TYPES = ["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "RECEIVED",
  "CONFIRMED",
  "OVERDUE",
  "REFUNDED",
  "RECEIVED_IN_CASH",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "AWAITING_RISK_ANALYSIS",
] as const;
export type AsaasPaymentStatus = (typeof PAYMENT_STATUSES)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

// ---------------------------------------------------------------- errors

export const AsaasErrorSchema = z.strictObject({
  errors: z.array(z.strictObject({ code: z.string(), description: z.string() })).min(1),
});
export type AsaasError = z.infer<typeof AsaasErrorSchema>;

// ---------------------------------------------------------------- requests
// Asaas ignores fields it does not know, so request schemas are not strict.
// Each field's message is the description returned in the `invalid_<field>` error.

const text = (message: string) => z.string({ error: message }).trim().min(1, { error: message });

export const CreateCustomerRequestSchema = z.looseObject({
  name: text("O nome do cliente deve ser informado."),
  cpfCnpj: text("O CPF/CNPJ informado é inválido."),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  mobilePhone: z.string().nullish(),
  address: z.string().nullish(),
  addressNumber: z.string().nullish(),
  complement: z.string().nullish(),
  province: z.string().nullish(),
  postalCode: z.string().nullish(),
  externalReference: z.string().nullish(),
  notificationDisabled: z.boolean().nullish(),
  additionalEmails: z.string().nullish(),
  municipalInscription: z.string().nullish(),
  stateInscription: z.string().nullish(),
  observations: z.string().nullish(),
  groupName: z.string().nullish(),
  company: z.string().nullish(),
  foreignCustomer: z.boolean().nullish(),
});
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;

export const ListCustomersQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  name: z.string().optional(),
  email: z.string().optional(),
  cpfCnpj: z.string().optional(),
  externalReference: z.string().optional(),
});

export const CreatePaymentRequestSchema = z.looseObject({
  customer: text("Customer Inválido ou não informado"),
  billingType: z.enum(BILLING_TYPES, { error: "É necessário informar uma forma de pagamento válida." }),
  value: z.number({ error: "O valor da cobrança deve ser informado." }).positive({
    error: "O valor da cobrança deve ser maior que zero.",
  }),
  dueDate: z.string({ error: "A data de vencimento da cobrança deve ser informada." }).regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "A data de vencimento informada é inválida.",
  }),
  description: z.string().max(500, { error: "A descrição deve ter no máximo 500 caracteres." }).nullish(),
  externalReference: z.string().nullish(),
  daysAfterDueDateToRegistrationCancellation: z.number().int().nullish(),
  installmentCount: z.number().int().nullish(),
  postalService: z.boolean().nullish(),
  creditCardToken: z.string().nullish(),
  remoteIp: z.string().nullish(),
  authorizeOnly: z.boolean().nullish(),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

// ---------------------------------------------------------------- responses

export const AsaasCustomerSchema = z.strictObject({
  object: z.literal("customer"),
  id: z.string().startsWith("cus_"),
  dateCreated: date,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobilePhone: z.string().nullable(),
  address: z.string().nullable(),
  addressNumber: z.string().nullable(),
  complement: z.string().nullable(),
  province: z.string().nullable(),
  city: z.number().nullable(),
  cityName: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  postalCode: z.string().nullable(),
  cpfCnpj: z.string(),
  personType: z.enum(["FISICA", "JURIDICA"]),
  deleted: z.boolean(),
  additionalEmails: z.string().nullable(),
  externalReference: z.string().nullable(),
  notificationDisabled: z.boolean(),
  observations: z.string().nullable(),
  foreignCustomer: z.boolean(),
});
export type AsaasCustomer = z.infer<typeof AsaasCustomerSchema>;

export const listSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    object: z.literal("list"),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    data: z.array(item),
  });

export const AsaasCustomerListSchema = listSchema(AsaasCustomerSchema);

export const AsaasCreditCardSchema = z.strictObject({
  creditCardNumber: z.string(),
  creditCardBrand: z.string(),
  creditCardToken: z.string(),
});

export const AsaasPaymentSchema = z.strictObject({
  object: z.literal("payment"),
  id: z.string().startsWith("pay_"),
  dateCreated: date,
  customer: z.string().startsWith("cus_"),
  subscription: z.string().nullable(),
  installment: z.string().nullable(),
  checkoutSession: z.string().nullable(),
  paymentLink: z.string().nullable(),
  value: z.number(),
  netValue: z.number(),
  originalValue: z.number().nullable(),
  interestValue: z.number().nullable(),
  description: z.string().nullable(),
  billingType: z.enum(BILLING_TYPES),
  creditCard: AsaasCreditCardSchema.nullable(),
  canBePaidAfterDueDate: z.boolean(),
  pixTransaction: z.string().nullable(),
  pixQrCodeId: z.string().nullable(),
  status: z.enum(PAYMENT_STATUSES),
  dueDate: date,
  originalDueDate: date,
  paymentDate: date.nullable(),
  clientPaymentDate: date.nullable(),
  confirmedDate: date.nullable(),
  installmentNumber: z.number().nullable(),
  invoiceUrl: z.string(),
  invoiceNumber: z.string(),
  externalReference: z.string().nullable(),
  deleted: z.boolean(),
  anticipated: z.boolean(),
  anticipable: z.boolean(),
  creditDate: date.nullable(),
  estimatedCreditDate: date.nullable(),
  transactionReceiptUrl: z.string().nullable(),
  nossoNumero: z.string().nullable(),
  bankSlipUrl: z.string().nullable(),
  discount: z.unknown().nullable(),
  fine: z.unknown().nullable(),
  interest: z.unknown().nullable(),
  split: z.array(z.unknown()),
  postalService: z.boolean(),
  daysAfterDueDateToRegistrationCancellation: z.number().nullable(),
  chargeback: z.unknown().nullable(),
  escrow: z.unknown().nullable(),
  refunds: z.array(z.unknown()),
  threeDSecureChallengeUrl: z.string().nullable(),
});
export type AsaasPayment = z.infer<typeof AsaasPaymentSchema>;

export const AsaasPixQrCodeSchema = z.strictObject({
  encodedImage: z.string(),
  payload: z.string(),
  expirationDate: dateTime,
  description: z.string().nullable(),
});
export type AsaasPixQrCode = z.infer<typeof AsaasPixQrCodeSchema>;

export const PAYMENT_EVENTS = ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE"] as const;
export type AsaasPaymentEvent = (typeof PAYMENT_EVENTS)[number];

export const AsaasPaymentWebhookSchema = z.strictObject({
  id: z.string().startsWith("evt_"),
  event: z.enum(PAYMENT_EVENTS),
  dateCreated: dateTime,
  account: z.strictObject({ id: z.string(), ownerId: z.string().nullable() }),
  payment: AsaasPaymentSchema,
});
export type AsaasPaymentWebhook = z.infer<typeof AsaasPaymentWebhookSchema>;

/** Header Asaas reads the API key from. */
export const API_KEY_HEADER = "access_token";
/** Header Asaas sends the webhook auth token in. */
export const WEBHOOK_TOKEN_HEADER = "asaas-access-token";
