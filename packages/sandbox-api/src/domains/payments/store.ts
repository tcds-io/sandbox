import type { PaymentOutcome, PaymentRecord, PaymentSummary } from "./model.js";

/** In-memory store of every payment, across providers. Lost on restart by design. */
export class PaymentStore {
  private readonly records = new Map<string, PaymentRecord>();

  private key(provider: string, id: string): string {
    return `${provider}:${id}`;
  }

  get<TData>(provider: string, id: string): PaymentRecord<TData> | undefined {
    return this.records.get(this.key(provider, id)) as PaymentRecord<TData> | undefined;
  }

  /** Inserts or replaces a payment, keeping its original creation time. */
  put<TData>(provider: string, id: string, data: TData, summary: PaymentSummary): PaymentRecord<TData> {
    const now = new Date().toISOString();
    const existing = this.get<TData>(provider, id);
    const record: PaymentRecord<TData> = {
      ...summary,
      provider,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      data,
    };
    this.records.set(this.key(provider, id), record);
    return record;
  }

  list(filter: { provider?: string; status?: string; outcome?: PaymentOutcome } = {}): PaymentRecord[] {
    return [...this.records.values()]
      .filter((r) => !filter.provider || r.provider === filter.provider)
      .filter((r) => !filter.status || r.status === filter.status)
      .filter((r) => !filter.outcome || r.outcome === filter.outcome)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  clear(): void {
    this.records.clear();
  }
}
