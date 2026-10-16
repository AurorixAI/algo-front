const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // The E2E harness (e2e/scripts/run.mjs) builds into its own directory, so it never overwrites the `.next`
  // of a running `next dev` / a normal `npm run build`. Unset = the default `.next`, i.e. nothing changes.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
