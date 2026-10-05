import type { ControlError, PaymentDetail, Payment, ProviderInfo, WebhookDelivery } from "sandbox-api/control";

export type { PaymentDetail, Payment, ProviderInfo, WebhookDelivery };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/_sandbox${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ControlError | null;
    throw new Error(body?.error.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  providers: () => request<{ data: ProviderInfo[] }>("/providers").then((r) => r.data),
  payments: (provider: string, status?: string) =>
    request<{ data: Payment[] }>(
      `/payments?${new URLSearchParams({ provider, ...(status ? { status } : {}) })}`,
    ).then((r) => r.data),
  payment: (provider: string, id: string) => request<PaymentDetail>(`/payments/${provider}/${id}`),
  act: (provider: string, id: string, action: string) =>
    request<PaymentDetail>(`/payments/${provider}/${id}/${action}`, { method: "POST" }),
  resend: (deliveryId: string) => request<WebhookDelivery>(`/webhooks/${deliveryId}/resend`, { method: "POST" }),
};
