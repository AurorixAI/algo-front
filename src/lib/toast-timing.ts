/**
 * How long a toast stays and whether it can be closed.  A failure (and a warning) replaced a blocking `alert` that waited for «ОК»: it
 * must stay long enough to be READ (a sentence of the server, a reason to fix) and be closed by the person - success toasts stay short.
 */
export const SUCCESS_TOAST_MS = 3500;
export const DETAILS_TOAST_MS = 10000;
export const ERROR_TOAST_MS = 8000;

export function toastLifetimeMs(type: "success" | "error" | "warning" | "info", hasDetails: boolean): number {
  if (hasDetails) return DETAILS_TOAST_MS;
  return type === "success" || type === "info" ? SUCCESS_TOAST_MS : ERROR_TOAST_MS;
}

/** The cross «×» is for toasts that stay long. */
export function toastClosable(type: "success" | "error" | "warning" | "info", hasDetails: boolean): boolean {
  return hasDetails || (type !== "success" && type !== "info");
}
