import type { Provider } from "../core/provider.js";
import { asaas } from "./asaas/index.js";

/**
 * Every simulated provider. Adding one (e.g. Stripe) means adding its folder
 * next to `asaas/` and listing it here; nothing else in the sandbox names a provider.
 */
export const providers: Provider[] = [asaas];
