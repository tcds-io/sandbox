import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Payment } from "./api.js";
import { dateTime, humanize, money } from "./format.js";
import { PaymentPanel } from "./PaymentPanel.js";
import { usePolling } from "./usePolling.js";

const STORAGE_KEY = "sandbox.provider";

const remembered = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function PaymentsPage() {
  const providers = usePolling(useCallback(() => api.providers(), []), 10_000);
  const [providerId, setProviderId] = useState<string | null>(remembered);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Fall back to the first provider when none (or an unknown one) is picked.
  useEffect(() => {
    const list = providers.data;
    if (list?.length && !list.some((p) => p.id === providerId)) setProviderId(list[0]!.id);
  }, [providers.data, providerId]);

  useEffect(() => {
    if (!providerId) return;
    try {
      localStorage.setItem(STORAGE_KEY, providerId);
    } catch {
      /* per-viewer convenience only */
    }
  }, [providerId]);

  const provider = providers.data?.find((p) => p.id === providerId);
  const load = useMemo(() => (providerId ? () => api.payments(providerId) : null), [providerId]);
  const payments = usePolling(load);

  const statuses = useMemo(() => [...new Set((payments.data ?? []).map((p) => p.status))].sort(), [payments.data]);
  const rows = (payments.data ?? []).filter((p) => !status || p.status === status);

  return (
    <div className="payments">
      <section className="toolbar">
        <label className="field">
          <span>Provider</span>
          <select
            value={providerId ?? ""}
            onChange={(e) => {
              setProviderId(e.target.value);
              setSelected(null);
              setStatus("");
            }}
          >
            {(providers.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        {provider && (
          <dl className="config">
            <div>
              <dt>Adapter base URL</dt>
              <dd>
                <code>{provider.apiBaseUrl}</code>
              </dd>
            </div>
            <div>
              <dt>Webhooks to</dt>
              <dd>{provider.webhookUrl ? <code>{provider.webhookUrl}</code> : <em>not configured</em>}</dd>
            </div>
          </dl>
        )}
      </section>

      {(providers.error || payments.error) && <p className="error">Cannot reach the sandbox API: {providers.error ?? payments.error}</p>}

      <div className={selected ? "split" : undefined}>
        <section className="card">
          {rows.length === 0 ? (
            <Empty loaded={payments.data !== undefined} filtered={Boolean(status)} baseUrl={provider?.apiBaseUrl} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="num">Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Row key={p.id} payment={p} active={p.id === selected} onSelect={() => setSelected(p.id === selected ? null : p.id)} />
                ))}
              </tbody>
            </table>
          )}
        </section>
        {selected && providerId && (
          <PaymentPanel
            key={selected}
            provider={providerId}
            id={selected}
            onClose={() => setSelected(null)}
            onChange={payments.refresh}
          />
        )}
      </div>
    </div>
  );
}

function Row({ payment, active, onSelect }: { payment: Payment; active: boolean; onSelect: () => void }) {
  return (
    <tr className={active ? "active" : undefined} onClick={onSelect} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect()}>
      <td className="num">{money(payment.amount, payment.currency)}</td>
      <td>{humanize(payment.method)}</td>
      <td>
        <StatusBadge status={payment.status} outcome={payment.outcome} />
      </td>
      <td className="mono muted">{payment.externalReference ?? "—"}</td>
      <td className="muted">{dateTime(payment.createdAt)}</td>
    </tr>
  );
}

export function StatusBadge({ status, outcome }: { status: string; outcome: string }) {
  return <span className={`badge badge-${outcome}`}>{humanize(status)}</span>;
}

function Empty({ loaded, filtered, baseUrl }: { loaded: boolean; filtered: boolean; baseUrl?: string }) {
  if (!loaded) return <p className="empty">Loading…</p>;
  if (filtered) return <p className="empty">No payments with this status.</p>;
  return (
    <div className="empty">
      <p>No payments yet.</p>
      {baseUrl && (
        <p className="muted">
          Point your app's adapter at <code>{baseUrl}</code> and create one. It shows up here.
        </p>
      )}
    </div>
  );
}
