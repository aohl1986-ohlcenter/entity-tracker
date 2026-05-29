import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0f1430",
          "navy-2": "#171c3e",
          emerald: "#10b981",
          gold: "#ffc829",
          "gold-soft": "#ffd75a",
          sky: "#7aa7ff",
        },
        owned: "#10b981",
        authority: "#7aa7ff",
        displacement: "#ff6b6b",
        neutral: "#94a3b8",
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        brand: "0 1px 0 rgba(255,255,255,0.04), 0 8px 24px -12px rgba(16,185,129,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
