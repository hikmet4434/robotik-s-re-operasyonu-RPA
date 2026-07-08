import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        muted: "#667085",
        line: "#d9e2ec",
        panel: "#ffffff",
        surface: "#f6f8fb",
        brand: "#0f766e",
        accent: "#2563eb",
        warning: "#d97706",
        danger: "#dc2626"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
