/** Where the E2E stack lives. The same defaults as e2e/docker-compose.e2e.yml and e2e/scripts/run.mjs. */
export const FRONT_PORT = Number(process.env.E2E_FRONT_PORT || 13000);
export const AUTH_PORT = Number(process.env.E2E_AUTH_PORT || 18000);
export const EXAM_PORT = Number(process.env.E2E_EXAM_PORT || 18003);

// `localhost` (not 127.0.0.1) everywhere: the auth cookies are host-only cookies of `localhost`, shared by
// the front (:13000) and the API (:18000) - the browser must open the front on the very same host name.
/** The console (static export `console/out`) is served by the K1 spec itself (support/console.ts) on its own port. */
export const CONSOLE_PORT = Number(process.env.E2E_CONSOLE_PORT || 13100);
export const CONSOLE_ORIGIN = `http://localhost:${CONSOLE_PORT}`;
/** The console host the auth-service knows (CONSOLE_HOSTS in e2e/docker-compose.e2e.yml). */
export const CONSOLE_HOST = "console.e2e.test";

export const FRONT_ORIGIN = `http://localhost:${FRONT_PORT}`;
export const AUTH_ORIGIN = `http://localhost:${AUTH_PORT}`;
export const AUTH_API = `http://localhost:${AUTH_PORT}/api/v1`;
export const EXAM_API = `http://localhost:${EXAM_PORT}/api/v1`;
