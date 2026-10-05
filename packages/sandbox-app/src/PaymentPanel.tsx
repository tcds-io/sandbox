import { useCallback, useState } from "react";
import { api, type WebhookDelivery } from "./api.js";
import { dateTime, humanize, money } from "./format.js";
import { StatusBadge } from "./PaymentsPage.js";
import { usePolling } from "./usePolling.js";

export function PaymentPanel(props: { provider: string; id: string; onClose: () => void; onChange: () => void }) {
  const { provider, id, onChange } = props;
  const payment = usePolling(useCallback(() => api.payment(provider, id), [provider, id]));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await payment.refresh();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const p = payment.data;
  // Newest delivery first.
  const deliveries = [...(p?.webhookDeliveries ?? [])].reverse();

  return (
    <aside className="card panel">
      <header className="panel-head">
        <div>
          <div className="mono muted">{id}</div>
          {p && (
            <div className="panel-title">
              <strong>{money(p.amount, p.currency)}</strong>
              <span>{humanize(p.method)}</span>
              <StatusBadge status={p.status} outcome={p.outcome} />
            </div>
          )}
        </div>
        <button className="ghost" onClick={props.onClose} aria-label="Close">
          ✕
        </button>
      </header>

      {!p && !payment.error && <p className="muted">Loading…</p>}
      {payment.error && <p className="error">{payment.error}</p>}
      {error && <p className="error">{error}</p>}

      {p && (
        <>
          <div className="actions">
            {p.availableActions.length === 0 && <span className="muted">No actions for a payment in this status.</span>}
            {p.availableActions.map((a) => (
              <button
                key={a.name}
                className={a.name === "confirm" ? "primary" : "secondary"}
                disabled={busy !== null}
                onClick={() => run(a.name, () => api.act(provider, id, a.name))}
              >
                {busy === a.name ? "Working…" : a.label}
              </button>
            ))}
          </div>

          <h3>Webhooks</h3>
          {deliveries.length === 0 && <p className="muted">None sent yet.</p>}
          <ul className="deliveries">
            {deliveries.map((d) => (
              <Delivery key={d.id} delivery={d} busy={busy === d.id} onResend={() => run(d.id, () => api.resend(d.id))} />
            ))}
          </ul>

          <details className="raw">
            <summary>Provider payload</summary>
            <pre>{JSON.stringify(p.data, null, 2)}</pre>
          </details>
        </>
      )}
    </aside>
  );
}

function Delivery({ delivery: d, busy, onResend }: { delivery: WebhookDelivery; busy: boolean; onResend: () => void }) {
  const last = d.attempts.at(-1);
  const code = last ? (last.responseStatus ?? "error") : d.status === "skipped" ? "—" : "…";
  return (
    <li className="delivery">
      <div className="delivery-head">
        <strong className="mono">{d.event}</strong>
        <span className={`badge badge-wh-${d.status}`}>{humanize(d.status)}</span>
        <span className="mono" title="Last response status">
          {code}
        </span>
        <button className="secondary small" disabled={busy || !d.url} onClick={onResend}>
          {busy ? "Sending…" : "Resend webhook"}
        </button>
      </div>
      <div className="muted small">
        {d.url ? <code>{d.url}</code> : "No webhook URL configured for this provider."}
        {" · "}
        {dateTime(d.createdAt)}
        {d.attempts.length > 1 && ` · ${d.attempts.length} attempts`}
        {d.resendOf && " · resend"}
      </div>
      {last?.error && <div className="error small">{last.error}</div>}
      <details>
        <summary>Payload</summary>
        <pre>{JSON.stringify({ headers: d.request.headers, body: d.request.body }, null, 2)}</pre>
      </details>
    </li>
  );
}
