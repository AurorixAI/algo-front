/** Where the E2E stack lives. The same defaults as e2e/docker-compose.e2e.yml and e2e/scripts/run.mjs. */
export const FRONT_PORT = Number(process.env.E2E_FRONT_PORT || 13000);
export const AUTH_PORT = Number(process.env.E2E_AUTH_PORT || 18000);
export const EXAM_PORT = Number(process.env.E2E_EXAM_PORT || 18003);

// `localhost` (not 127.0.0.1) everywhere: the auth cookies are host-only cookies of `localhost`, shared by
// the front (:13000) and the API (:18000) - the browser must open the front on the very same host name.
export const FRONT_ORIGIN = `http://localhost:${FRONT_PORT}`;
export const AUTH_ORIGIN = `http://localhost:${AUTH_PORT}`;
export const AUTH_API = `http://localhost:${AUTH_PORT}/api/v1`;
export const EXAM_API = `http://localhost:${EXAM_PORT}/api/v1`;
