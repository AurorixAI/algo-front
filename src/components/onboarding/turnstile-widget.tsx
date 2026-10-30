"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Cloudflare Turnstile widget, loaded the way the landing does it (K2-2, B; LESSONS 62): ``render=explicit`` and the ``onload`` callback that Cloudflare
 * calls when its API is ready. ``turnstile.ready()`` must NOT be used from ``script.onload`` (it never fires there). A failed load (network, blocked, 15 s)
 * rejects and forgets the promise, so «Повторить проверку» loads it again. An empty site key = no widget (a local run; the server then must not hold a secret).
 */
interface TurnstileAPI {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
    [name: string]: unknown;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const ONLOAD = "__algoTurnstileLoaded";
let scriptPromise: Promise<TurnstileAPI> | undefined;

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

function loadChallenge(): Promise<TurnstileAPI> {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      delete window[ONLOAD];
      script.remove();
      scriptPromise = undefined;
      reject(new Error("challenge_unavailable"));
    };
    const timer = window.setTimeout(fail, 15000);
    window[ONLOAD] = () => {
      clearTimeout(timer);
      delete window[ONLOAD];
      if (window.turnstile?.render) resolve(window.turnstile);
      else fail();
    };
    script.src = `${SCRIPT_URL}?render=explicit&onload=${ONLOAD}`;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

const COPY = {
  label: "Проверка перед отправкой",
  loading: "Подготавливаем проверку…",
  failed: "Проверка недоступна. Проверьте соединение и повторите.",
  expired: "Время проверки истекло. Пройдите её ещё раз.",
  retry: "Повторить проверку",
};

/** ``onToken("")`` means «no valid token now». ``reset`` (a number) makes the widget ask again (a token is single-use). */
export function TurnstileWidget({ onToken, reset, action }: { onToken: (token: string) => void; reset: number; action: string }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "expired">("loading");

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) {
      callback.current("");
      return undefined;
    }
    let disposed = false;
    let widget: string | undefined;
    let api: TurnstileAPI | undefined;
    callback.current("");
    setState("loading");
    loadChallenge()
      .then((loaded) => {
        if (disposed || !container.current) return;
        api = loaded;
        widget = api.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: "light",
          size: "flexible",
          language: "ru",
          "response-field": false,
          callback: (token: string) => {
            if (!disposed) {
              callback.current(token);
              setState("ready");
            }
          },
          "expired-callback": () => {
            if (!disposed) {
              callback.current("");
              setState("expired");
            }
          },
          "error-callback": () => {
            if (!disposed) {
              callback.current("");
              setState("failed");
            }
            return true;
          },
        });
        setState("ready");
      })
      .catch(() => {
        if (!disposed) setState("failed");
      });
    return () => {
      disposed = true;
      if (widget !== undefined) api?.remove(widget);
    };
  }, [reset, attempt, action]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div aria-label={COPY.label} data-testid="turnstile" className="-mx-1">
      <div ref={container} />
      {state === "loading" && <p role="status" className="text-sm text-slate-500">{COPY.loading}</p>}
      {(state === "failed" || state === "expired") && (
        <div role="alert" className="mt-2 text-sm text-slate-600">
          <p>{state === "expired" ? COPY.expired : COPY.failed}</p>
          <button type="button" className="mt-1 font-medium text-primary-600 hover:text-primary-700" onClick={() => setAttempt((value) => value + 1)}>
            {COPY.retry}
          </button>
        </div>
      )}
    </div>
  );
}
