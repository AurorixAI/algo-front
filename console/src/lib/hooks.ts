"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestSequence } from "@/lib/request-sequence";
import { HttpError } from "@/lib/http-json";

export interface Resource<T> {
  data: T | null;
  /** First load (nothing to show yet). */
  loading: boolean;
  /** A reload with the previous data still on screen. */
  refreshing: boolean;
  error: HttpError | Error | null;
  reload: () => void;
}

/**
 * Loads data when `deps` change; the latest request wins (a slow answer to an old filter never overwrites a new one);
 * the old rows stay on screen while a new page loads, an error never turns into an empty list.
 */
export function useResource<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; refreshing: boolean; error: Error | null }>({
    data: null, loading: load !== null, refreshing: false, error: null,
  });
  const sequence = useRef(createRequestSequence());
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) {
      setState({ data: null, loading: false, refreshing: false, error: null });
      return undefined;
    }
    const token = sequence.current.next();
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: s.data === null, refreshing: s.data !== null, error: null }));
    fn(controller.signal)
      .then((data) => {
        if (sequence.current.isCurrent(token)) setState({ data, loading: false, refreshing: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !sequence.current.isCurrent(token)) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, error: error instanceof Error ? error : new Error(String(error)) }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** The `?id=` of the address as state, so an opened card can be linked to and survives a reload.  (A static export has no dynamic routes.) */
export function useUrlId(param = "id"): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setId(new URLSearchParams(window.location.search).get(param));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [param]);
  const set = useCallback((next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set(param, next);
    else url.searchParams.delete(param);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setId(next);
  }, [param]);
  return [id, set];
}

/** What an error says to a person. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так. Повторите попытку.";
}
