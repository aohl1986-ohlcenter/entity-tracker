import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        owned: "#16a34a",
        authority: "#2563eb",
        displacement: "#dc2626",
        neutral: "#64748b",
      },
    },
  },
  plugins: [],
};

export default config;
