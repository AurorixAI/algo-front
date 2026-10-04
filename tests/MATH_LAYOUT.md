# Math layout browser regression

`npm run test:math-layout` opens the real frontend pages with synthetic HTTP
responses. It checks diagnostic, online exam, admin preview, teacher draft,
exam report and diagnostic error report at 360, 768 and 1280 px (27 states).
Fixtures include integral limits, nested roots/fractions, a stacked brace and
a wide formula. Assertions cover glyph bounds, parse errors, canonical source,
page overflow and scrolling the wide formula to its end.

This is a rendering regression, not acceptance of backend contracts, RBAC,
answer correctness, the content bank or the diagnostic model. All `/api/v1/`
requests are intercepted. The harness refuses non-local frontend URLs.

CI installs Playwright 1.62.1 in a temporary tool directory, builds the app,
starts its standalone server and runs this harness. Production dependencies
are unchanged. Synthetic screenshots and JSON are uploaded as `math-layout`.

For local use, start the standalone build with its `public` and `.next/static`
assets, then provide `QA_BASE` and `PLAYWRIGHT_MODULE_PATH` if Playwright is
outside this repository. `CHROME_EXECUTABLE_PATH` optionally selects an existing
Chrome installation. `QA_OUTPUT` selects the output directory (default:
`.qa/math-layout`, ignored by Git). `QA_LABEL=before` captures a known broken
baseline without asserting that it passed; CI always uses the default candidate
mode, which asserts all 27 states.
