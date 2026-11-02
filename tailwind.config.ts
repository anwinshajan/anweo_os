import type { Config } from "tailwindcss";

// Anweo brand tokens, taken from the brand sheet:
//   forest #0E5A44 · lime #C9F25A · ink #141413 · paper #F4F3EF · charcoal #2A2A28
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#0E5A44", deep: "#0A4535", soft: "#E3EEE9", mid: "#A3BDB3" },
        lime: { DEFAULT: "#C9F25A", deep: "#B4DD3F", soft: "#EEF8CE" },
        ink: "#141413",
        charcoal: "#2A2A28",
        paper: "#F4F3EF",
        edge: "#E2E0D8",
        mute: "#6F6F69",
      },
      fontFamily: {
        sans: ['"Inter Tight Variable"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(20,20,19,.04), 0 8px 24px -12px rgba(20,20,19,.12)",
        lift: "0 12px 32px -12px rgba(14,90,68,.35)",
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
