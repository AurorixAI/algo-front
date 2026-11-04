const React = require("react");
module.exports = { __esModule: true, default: React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { ref, href: typeof href === "string" ? href : String(href), ...rest }, children); }) };
