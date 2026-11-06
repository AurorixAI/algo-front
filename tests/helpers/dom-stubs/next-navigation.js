const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
module.exports = { useRouter: () => router, usePathname: () => (typeof window !== "undefined" && window.__pathname) || "/owner", useSearchParams: () => new URLSearchParams(typeof window !== "undefined" && window.__search ? window.__search : ""), useParams: () => ({}), redirect() {}, notFound() {} };
