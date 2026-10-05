import { defineProvider } from "../../core/provider.js";
import { confirmCard, overdue, receive, summarize } from "./mappers.js";
import { asaasRoutes } from "./routes.js";
import type { AsaasPayment } from "./schemas.js";
import { buildPaymentWebhook } from "./webhooks.js";

const payable = (p: AsaasPayment) => p.status === "PENDING" || p.status === "OVERDUE";

export const asaas = defineProvider<AsaasPayment>({
  id: "asaas",
  displayName: "Asaas",
  apiPath: "/v3",
  routes: asaasRoutes,
  payments: {
    summarize,
    buildWebhook: buildPaymentWebhook,
    actions: {
      confirm: {
        label: "Confirm payment",
        isAvailable: payable,
        // Pix and boleto land as RECEIVED; a card paid on the invoice page is CONFIRMED.
        apply: (p, { now, publicUrl }) =>
          p.billingType === "CREDIT_CARD"
            ? { data: confirmCard(p, null, now, publicUrl), events: ["PAYMENT_CONFIRMED"] }
            : { data: receive(p, now, publicUrl), events: ["PAYMENT_RECEIVED"] },
      },
      expire: {
        label: "Mark overdue",
        isAvailable: (p) => p.status === "PENDING",
        apply: (p) => ({ data: overdue(p), events: ["PAYMENT_OVERDUE"] }),
      },
    },
  },
});
