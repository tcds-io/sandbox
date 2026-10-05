import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { createSandbox, type Sandbox } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { providers } from "../../src/providers/index.js";

export const API_KEY = "$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDAwMDAwMDAwMDAwMDAwMDA6OiRhYWNoXzAwMDA=";
export const WEBHOOK_TOKEN = "whsec_sandbox_test_token";

export interface ReceivedWebhook {
  headers: IncomingHttpHeaders;
  body: any;
}

/** A local HTTP server standing in for the app under test's webhook endpoint. */
export class WebhookReceiver {
  readonly received: ReceivedWebhook[] = [];
  /** Status codes to answer with, in order; once used up the receiver answers 200. */
  respondWith: number[] = [];
  private server!: Server;
  private waiters: (() => void)[] = [];

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        this.received.push({ headers: req.headers, body: JSON.parse(raw) });
        res.writeHead(this.respondWith.shift() ?? 200).end();
        for (const wake of this.waiters.splice(0)) wake();
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/webhooks/asaas`;
  }

  /** Resolves with the first webhook matching `predicate`, waiting for it if needed. */
  async waitFor(predicate: (w: ReceivedWebhook) => boolean, timeoutMs = 5000): Promise<ReceivedWebhook> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const match = this.received.find(predicate);
      if (match) return match;
      if (Date.now() > deadline) throw new Error("Timed out waiting for webhook");
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

/** Builds a sandbox with test settings, without listening on a port. */
export function testSandbox(env: Record<string, string> = {}): Sandbox {
  const config = loadConfig(
    providers.map((p) => p.id),
    {
      PUBLIC_URL: "http://sandbox.test",
      ASAAS_API_KEY: API_KEY,
      ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
      WEBHOOK_RETRY_BASE_MS: "20",
      ...env,
    },
  );
  return createSandbox(config, providers);
}

/** Starts a sandbox on a random port. */
export async function startSandbox(env: Record<string, string> = {}) {
  const sandbox = testSandbox(env);
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: sandbox.app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    sandbox,
    baseUrl,
    stop: async () => {
      sandbox.reset();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Today's date in Brasília (the date Asaas validates due dates against), plus `days`. */
export function dueDate(days = 3): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + days * 86_400_000));
}
