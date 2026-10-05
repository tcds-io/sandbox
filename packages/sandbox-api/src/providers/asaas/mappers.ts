import { randomBytes } from "node:crypto";
import { digits } from "../../core/ids.js";
import type { PaymentOutcome, PaymentSummary } from "../../domains/payments/model.js";
import { addDays, toDate } from "./dates.js";
import type { AsaasCustomer, AsaasPayment, AsaasPaymentStatus, CreateCustomerRequest, CreatePaymentRequest } from "./schemas.js";

const ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyz0123456789";
const alnum = (length: number) =>
  Array.from(randomBytes(length), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");

export const newCustomerId = () => `cus_${digits(12)}`;
export const newPaymentId = () => `pay_${alnum(16)}`;

/** Days Asaas takes to credit a confirmed card payment. */
const CARD_CREDIT_DAYS = 32;

export function toCustomer(
  id: string,
  req: CreateCustomerRequest,
  doc: { digits: string; personType: "FISICA" | "JURIDICA" },
  now: Date,
): AsaasCustomer {
  return {
    object: "customer",
    id,
    dateCreated: toDate(now),
    name: req.name,
    email: req.email ?? null,
    phone: req.phone ?? null,
    mobilePhone: req.mobilePhone ?? null,
    address: req.address ?? null,
    addressNumber: req.addressNumber ?? null,
    complement: req.complement ?? null,
    province: req.province ?? null,
    city: null,
    cityName: null,
    state: null,
    country: "Brasil",
    postalCode: req.postalCode ? req.postalCode.replace(/\D/g, "") : null,
    cpfCnpj: doc.digits,
    personType: doc.personType,
    deleted: false,
    additionalEmails: req.additionalEmails ?? null,
    externalReference: req.externalReference ?? null,
    notificationDisabled: req.notificationDisabled ?? false,
    observations: req.observations ?? null,
    foreignCustomer: req.foreignCustomer ?? false,
  };
}

export function toPayment(
  id: string,
  req: CreatePaymentRequest,
  ctx: { publicUrl: string; invoiceNumber: string; now: Date },
): AsaasPayment {
  const slug = id.replace(/^pay_/, "");
  const isSlip = req.billingType === "BOLETO" || req.billingType === "UNDEFINED";
  return {
    object: "payment",
    id,
    dateCreated: toDate(ctx.now),
    customer: req.customer,
    subscription: null,
    installment: null,
    checkoutSession: null,
    paymentLink: null,
    value: req.value,
    netValue: req.value,
    originalValue: null,
    interestValue: null,
    description: req.description ?? null,
    billingType: req.billingType,
    creditCard: null,
    canBePaidAfterDueDate: true,
    pixTransaction: null,
    pixQrCodeId: null,
    status: "PENDING",
    dueDate: req.dueDate,
    originalDueDate: req.dueDate,
    paymentDate: null,
    clientPaymentDate: null,
    confirmedDate: null,
    installmentNumber: null,
    invoiceUrl: `${ctx.publicUrl}/asaas/i/${slug}`,
    invoiceNumber: ctx.invoiceNumber,
    externalReference: req.externalReference ?? null,
    deleted: false,
    anticipated: false,
    anticipable: false,
    creditDate: null,
    estimatedCreditDate: null,
    transactionReceiptUrl: null,
    nossoNumero: isSlip ? digits(8) : null,
    bankSlipUrl: isSlip ? `${ctx.publicUrl}/asaas/b/pdf/${slug}` : null,
    discount: null,
    fine: null,
    interest: null,
    split: [],
    postalService: req.postalService ?? false,
    daysAfterDueDateToRegistrationCancellation: req.daysAfterDueDateToRegistrationCancellation ?? null,
    chargeback: null,
    escrow: null,
    refunds: [],
    threeDSecureChallengeUrl: null,
  };
}

const receipt = (p: AsaasPayment, publicUrl: string) => `${publicUrl}/asaas/comprovantes/${p.id.replace(/^pay_/, "")}`;

/** Card payment authorized and captured: CONFIRMED, credited later. */
export function confirmCard(p: AsaasPayment, card: AsaasPayment["creditCard"], now: Date, publicUrl: string): AsaasPayment {
  return {
    ...p,
    status: "CONFIRMED",
    creditCard: card ?? p.creditCard,
    confirmedDate: toDate(now),
    clientPaymentDate: toDate(now),
    estimatedCreditDate: toDate(addDays(now, CARD_CREDIT_DAYS)),
    transactionReceiptUrl: receipt(p, publicUrl),
  };
}

/** Pix (or boleto) paid: money is in the account right away, so RECEIVED. */
export function receive(p: AsaasPayment, now: Date, publicUrl: string): AsaasPayment {
  const today = toDate(now);
  return {
    ...p,
    status: "RECEIVED",
    confirmedDate: today,
    paymentDate: today,
    clientPaymentDate: today,
    creditDate: today,
    estimatedCreditDate: today,
    transactionReceiptUrl: receipt(p, publicUrl),
  };
}

export const overdue = (p: AsaasPayment): AsaasPayment => ({ ...p, status: "OVERDUE" });

const OUTCOMES: Partial<Record<AsaasPaymentStatus, PaymentOutcome>> = {
  PENDING: "pending",
  AWAITING_RISK_ANALYSIS: "pending",
  RECEIVED: "paid",
  CONFIRMED: "paid",
  RECEIVED_IN_CASH: "paid",
  OVERDUE: "failed",
};

export function summarize(p: AsaasPayment): PaymentSummary {
  return {
    amount: p.value,
    currency: "BRL",
    method: p.billingType,
    status: p.status,
    outcome: OUTCOMES[p.status] ?? "other",
    externalReference: p.externalReference,
  };
}
