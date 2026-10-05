import { useEffect, useState } from "react";
import { PaymentsPage } from "./PaymentsPage.js";

/** Domains the sandbox simulates. Refunds, payouts or customers are added here later. */
const DOMAINS = [{ id: "payments", title: "Payments", blurb: "Confirm or expire payments your app created, and watch the webhooks." }] as const;
type DomainId = (typeof DOMAINS)[number]["id"];

const readHash = (): DomainId | null => {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return DOMAINS.some((d) => d.id === id) ? (id as DomainId) : null;
};

export function App() {
  const [domain, setDomain] = useState<DomainId | null>(readHash);

  useEffect(() => {
    const onHash = () => setDomain(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          Provider Sandbox
        </a>
        <span className="tag">Test only · state lives in memory</span>
      </header>
      <main>{domain === "payments" ? <PaymentsPage /> : <DomainPicker />}</main>
    </div>
  );
}

function DomainPicker() {
  return (
    <section className="picker">
      <h1>What do you want to do?</h1>
      <div className="picker-grid">
        {DOMAINS.map((d) => (
          <a key={d.id} className="picker-card" href={`#/${d.id}`}>
            <strong>{d.title}</strong>
            <span>{d.blurb}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
