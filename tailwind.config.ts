import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

/**
 * Design tokens (waves 0-1 of the design system, artifacts/analysis/DESIGN_SYSTEM_AUDIT.md §3).  They sit ON TOP of Tailwind 3.4: a role is a name for a palette that is already in use, so the migration is
 * mechanical.  The values that other readers need too (an inline style, a CSS rule) are repeated in `src/styles/tokens.css`; `tests/design-gate.test.cjs` keeps the two in step.
 *
 *  - COLOUR, 7 roles: neutral (slate), accent (primary blue), success (emerald), warning (amber), danger (rose - the only red), info (sky), muted (secondary text).
 *    Text on white: `text-slate-900/700/600`, `text-muted` (4.8:1); `slate-300/400` are for icons and disabled things only.  White on `-600/-700` of accent, danger and success passes 4.5:1.
 *  - TYPE, 6 steps: caption 12 / body 14 / section 16 / title 20 / page 24 / display 30 (the same sizes as text-xs ... text-3xl, which stay the working classes).
 *  - SPACE: a 4 px grid (Tailwind's own); named steps for the repeating gaps: gutter, card, card-lg, block.
 *  - RADIUS: tag 6 / control 12 / card 16 / modal 20 (+ rounded-full for a status pill, an avatar, a dot).
 *  - SHADOW, 2 levels: card (a card, a field, a selected segment) and pop (a window, a menu, a toast).  The old names fall on them: sm / DEFAULT / md = card, lg / xl / 2xl = pop.
 *  - CONTROL HEIGHT: 40 on a desktop, 32 for a dense row (40 on a phone), 48 for the main button of a sheet; on a phone 44 in the cabinets of a teacher and a student (`html[data-density="touch"]`).
 */
export const SHADOW_CARD = "0 1px 2px rgb(15 23 42 / 0.05), 0 2px 8px -2px rgb(15 23 42 / 0.06)";
export const SHADOW_POP = "0 12px 32px -8px rgb(15 23 42 / 0.18)";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        background: "#eff3f8",
        "background-light": "#eff3f8",
        // roles (the audit §3.1): palettes that already exist, under the name of what they MEAN
        neutral: colors.slate,
        accent: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a",
        },
        success: colors.emerald,
        warning: colors.amber,
        danger: colors.rose,
        info: colors.sky,
        muted: { DEFAULT: colors.slate[500], strong: colors.slate[600], subtle: colors.slate[400], surface: colors.slate[100] },
      },
      fontSize: {
        caption: ["0.75rem", { lineHeight: "1rem" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        section: ["1rem", { lineHeight: "1.5rem" }],
        title: ["1.25rem", { lineHeight: "1.75rem" }],
        page: ["1.5rem", { lineHeight: "2rem" }],
        display: ["1.875rem", { lineHeight: "2.25rem" }],
      },
      spacing: {
        gutter: "1rem",
        card: "1rem",
        "card-lg": "1.25rem",
        block: "1.5rem",
      },
      borderRadius: {
        tag: "6px",
        control: "12px",
        card: "16px",
        modal: "20px",
      },
      boxShadow: {
        card: SHADOW_CARD,
        pop: SHADOW_POP,
        // the two levels are all there is: the older names are aliases of them
        sm: SHADOW_CARD,
        DEFAULT: SHADOW_CARD,
        md: SHADOW_CARD,
        lg: SHADOW_POP,
        xl: SHADOW_POP,
        "2xl": SHADOW_POP,
      },
      width: {
        control: "2.5rem",
        "control-sm": "2rem",
        "control-touch": "var(--control-h-touch, 2.5rem)",
      },
      height: {
        control: "2.5rem",
        "control-sm": "2rem",
        "control-lg": "3rem",
        "control-touch": "var(--control-h-touch, 2.5rem)",
      },
      minHeight: {
        control: "2.5rem",
        "control-sm": "2rem",
        "control-lg": "3rem",
        // a control on a phone: 40, and 44 in the cabinets of a teacher and a student (tokens.css sets the variable)
        "control-touch": "var(--control-h-touch, 2.5rem)",
        "control-sm-touch": "2.5rem",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        math: ["'Noto Serif'", "Georgia", "serif"],
      },
      animation: {
        "slide-up": "slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fadeIn 0.3s ease-out",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite linear",
        "slide-out-blur": "slideOutBlur 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "scale-up-fade": "scaleUpFadeIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both",
        "toast-enter": "toastEnter 0.5s ease-out 0.2s both",
        "liquid-pulse": "liquidPulse 3s ease-in-out infinite",
        "liquid-rise": "liquidRise 3s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "count-up": "countUp 3s cubic-bezier(0.4, 0, 0.2, 1) forwards",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": {
            boxShadow: "0 0 15px rgba(37, 99, 235, 0.3), 0 0 5px rgba(37, 99, 235, 0.1) inset",
          },
          "50%": {
            boxShadow: "0 0 25px rgba(37, 99, 235, 0.6), 0 0 10px rgba(37, 99, 235, 0.2) inset",
          },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        slideOutBlur: {
          "0%": { transform: "translateX(0) scale(1)", opacity: "1", filter: "blur(0)" },
          "100%": { transform: "translateX(-120px) scale(0.9)", opacity: "0", filter: "blur(12px)" },
        },
        scaleUpFadeIn: {
          "0%": { transform: "scale(0.92)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        toastEnter: {
          "0%": { transform: "translate(-50%, -100%)", opacity: "0" },
          "100%": { transform: "translate(-50%, 24px)", opacity: "1" },
        },
        liquidPulse: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        liquidRise: {
          "0%": { height: "15%" },
          "100%": { height: "64%" },
        },
        countUp: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-83.33%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
