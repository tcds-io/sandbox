import { serve } from "@hono/node-server";
import { createSandbox } from "./app.js";
import { loadConfig } from "./config.js";
import { providers } from "./providers/index.js";

const config = loadConfig(providers.map((p) => p.id));
const { app } = createSandbox(config, providers);

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`sandbox-api listening on ${config.publicUrl}`);
  for (const p of providers) {
    const settings = config.providers[p.id] ?? {};
    console.log(`  ${p.displayName}: ${config.publicUrl}/${p.id}${p.apiPath}`);
    console.log(`    webhooks -> ${settings.webhookUrl ?? "(not configured, deliveries are recorded as skipped)"}`);
    if (!settings.apiKey) console.log("    api key  -> any non-empty key is accepted");
  }
});
