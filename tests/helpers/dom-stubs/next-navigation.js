const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
module.exports = { useRouter: () => router, usePathname: () => "/owner", useSearchParams: () => new URLSearchParams(), useParams: () => ({}), redirect() {}, notFound() {} };
