/**
 * Helpers of the console K1 spec.  Test-only: nothing here is product code, nothing here runs outside the throw-away e2e stack.
 *
 *  - `startConsoleServer()`: serves the static export `console/out` (like nginx: `try_files $uri $uri/index.html`) and proxies
 *    `/api/v1/platform/*` to the auth-service with `Host: console.e2e.test`, the host the platform API answers on (CONSOLE_HOSTS).
 *  - `createPlatformOwner()`: the first owner of the console.  In production the owner runs `scripts/create_platform_owner.py`
 *    by hand on the server; here the same product function (`create_owner`) is called inside the auth container.
 *  - `issueSetPasswordToken()`: the «Задать пароль» link.  The stack has no SMTP, and an unsent letter is not logged with its body,
 *    so the link cannot be read from a mailbox.  The product's own `password_links.issue()` (the very call behind «Отправить
 *    приглашение снова») issues a fresh link for the owner in the container and the helper returns its token.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { AUTH_PORT, CONSOLE_HOST, CONSOLE_PORT } from "./env";

// Playwright loads the specs as CommonJS: `__dirname` is e2e/support.
const OUT = path.resolve(__dirname, "../../console/out");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".txt": "text/plain", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png",
};

export function consoleBuildExists(): boolean {
  return existsSync(path.join(OUT, "index.html"));
}

/** Starts the console server; resolves with a `close()`.  Throws a clear message when `console/out` was not built. */
export async function startConsoleServer(): Promise<{ close: () => Promise<void> }> {
  if (!consoleBuildExists()) throw new Error("console/out is missing: run `npm run console:build` (npm run e2e does it)");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    if (url.pathname.startsWith("/api/v1/platform/")) {
      const headers: http.OutgoingHttpHeaders = { ...req.headers, host: CONSOLE_HOST, "x-real-ip": "10.77.0.1" };
      delete headers["x-forwarded-host"];
      if (headers.origin) headers.origin = `http://${CONSOLE_HOST}`;
      const upstream = http.request(
        { host: "127.0.0.1", port: AUTH_PORT, method: req.method, path: url.pathname + url.search, headers },
        (up) => {
          res.writeHead(up.statusCode || 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    let file = path.join(OUT, decodeURIComponent(url.pathname));
    if (!file.startsWith(OUT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(CONSOLE_PORT, "127.0.0.1", resolve);
  });
  return { close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function authContainer(): string {
  const ps = spawnSync("docker", ["compose", "-p", "algo-e2e", "ps", "-q", "auth"], { encoding: "utf8" });
  const id = ps.stdout.trim().split("\n")[0];
  if (!id) throw new Error("the auth container of the algo-e2e stack was not found");
  return id;
}

/** Runs a Python script inside the auth container (stdin) with `args` in `sys.argv[1:]`; returns stdout. */
function execInAuth(script: string, args: string[]): string {
  const run = spawnSync("docker", ["exec", "-i", authContainer(), "python", "-", ...args], { input: script, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`auth container script failed: ${(run.stderr || run.stdout).slice(-600)}`);
  return run.stdout;
}

const LOAD_APP = "import src.api.main_v2  # noqa: F401 (the application first: the modules import each other)\n";

export function createPlatformOwner(email: string, password: string): void {
  execInAuth(
    `${LOAD_APP}import sys
from src.auth.platform_bootstrap import create_owner
from src.core.database import db_session
with db_session() as db:
    create_owner(db, sys.argv[1], sys.argv[2], "Тест", "Владелец")
print("ok")
`,
    [email, password],
  );
}

export function issueSetPasswordToken(email: string): string {
  const out = execInAuth(
    `${LOAD_APP}import sys
from sqlalchemy import func
from src.auth.password_links import issue
from src.core.database import db_session
from src.models.auth import User
with db_session() as db:
    user = db.query(User).filter(func.lower(User.email) == sys.argv[1].lower()).one()
    raw, _ = issue(db, user.id, "centre_invite")
    db.commit()
print("TOKEN=" + raw)
`,
    [email],
  );
  const token = /TOKEN=(\S+)/.exec(out)?.[1];
  if (!token) throw new Error("no token in the container's answer");
  return token;
}
