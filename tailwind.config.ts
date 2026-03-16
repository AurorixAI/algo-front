import type { Config } from "tailwindcss";

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
