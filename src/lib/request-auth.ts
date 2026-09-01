import "server-only";

import { cache } from "react";
import { auth } from "./auth";

/**
 * React cache is scoped to a Server Component render. It can deduplicate the
 * app layout and a page in one RSC tree, but is intentionally not used by
 * Proxy or Route Handlers, which are separate request/runtime boundaries.
 */
export const getRscSession = cache(async () => auth());
