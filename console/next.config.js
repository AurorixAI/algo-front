/**
 * The ALGO console is a STATIC export (`out/`): nginx serves the folder, there is no Node process and no data of its own.
 * Every call goes to the accounting server's `/api/v1/platform/*` on the same host (nginx proxies it).
 *
 * The UI kit (`../src/components/ui`) and the pure helpers (`../src/lib`) are the platform's own files, imported through
 * the `@/` alias (see tsconfig.json): `externalDir` lets Next compile files outside this folder. Packages (react, next,
 * framer-motion...) resolve from `../node_modules` for both sides, so there is exactly one copy of React.
 */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // `/requests/` -> requests/index.html: nginx serves a folder with `try_files $uri $uri/ ...`, no rewrite rules.
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: { externalDir: true },
};

module.exports = nextConfig;
