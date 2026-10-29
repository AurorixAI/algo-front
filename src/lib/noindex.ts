import type { Metadata } from "next";

/**
 * `<meta name="robots" content="noindex, nofollow">` for the pages whose address is a secret or a one-time code
 * (K3 P3, risk 19): the diagnostic report (/d/, /diagnostic/), the exam (/e/), the invitation (/invite/), «Задать пароль»
 * (/set-password/).  A search engine must not list them even if an address leaks to a page that it crawls.
 * `robots.txt` of the product is closed as a whole (app/robots.ts); this is the second belt for a crawler that ignores it.
 */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };
