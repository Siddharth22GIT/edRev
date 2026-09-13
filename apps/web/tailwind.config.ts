import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 8px 24px rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
