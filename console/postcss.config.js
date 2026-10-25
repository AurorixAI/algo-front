const path = require("path");

module.exports = {
  plugins: {
    // An explicit config: the build may be started from the repository root, where the cabinets' own config sits.
    tailwindcss: { config: path.join(__dirname, "tailwind.config.ts") },
    autoprefixer: {},
  },
};
