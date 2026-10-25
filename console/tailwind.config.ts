import type { Config } from "tailwindcss";
import base from "../tailwind.config";

/** The cabinets' theme (colours, fonts, animations), scanning the console's own files and the shared UI kit only. */
const config: Config = {
  ...base,
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../src/components/ui/**/*.{js,ts,jsx,tsx}",
  ],
};

export default config;
