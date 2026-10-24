import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: {
            DEFAULT: "#F2A65A",
            hover: "#E59443",
            dark: "#C27803",
            light: "#FEF6EE",
            border: "#FBD7B3",
          },
          blue: {
            DEFAULT: "#3978B8",
            hover: "#2F659C",
            dark: "#204D7D",
            light: "#EFF6FC",
            border: "#C2DCF2",
          },
          bg: "#F7F7F6",
          card: "#FFFFFF",
          text: {
            DEFAULT: "#30343B",
            muted: "#666D7A",
            light: "#8C93A0",
          },
          border: {
            DEFAULT: "#E6E6E6",
            dark: "#D1D5DB",
          },
        },
      },
      boxShadow: {
        panel: "0 4px 16px -2px rgba(48, 52, 59, 0.05), 0 2px 6px -1px rgba(48, 52, 59, 0.03)",
        card: "0 1px 3px 0 rgba(48, 52, 59, 0.04), 0 1px 2px -1px rgba(48, 52, 59, 0.04)",
        cardHover: "0 6px 20px -4px rgba(48, 52, 59, 0.08), 0 4px 8px -2px rgba(48, 52, 59, 0.04)",
        dropdown: "0 10px 25px -5px rgba(48, 52, 59, 0.1), 0 8px 10px -6px rgba(48, 52, 59, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
