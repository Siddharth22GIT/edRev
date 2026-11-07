import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

/** U2: brand colours come from the CSS variables in app/globals.css, so opacity modifiers work (bg-brand-orange/20). */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // lib/ holds UI too (e.g. the toast container), so its class names must be generated as well
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // U1: next/font variables set on <html> in app/layout.tsx
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
      colors: {
        brand: {
          orange: {
            DEFAULT: token("brand-orange"),
            hover: token("brand-orange-hover"),
            dark: token("brand-orange-dark"),
            light: token("brand-orange-light"),
            border: token("brand-orange-border"),
          },
          blue: {
            DEFAULT: token("brand-blue"),
            hover: token("brand-blue-hover"),
            dark: token("brand-blue-dark"),
            light: token("brand-blue-light"),
            border: token("brand-blue-border"),
          },
          bg: token("brand-bg"),
          card: token("brand-card"),
          text: {
            DEFAULT: token("brand-text"),
            muted: token("brand-text-muted"),
            light: token("brand-text-light"),
          },
          border: {
            DEFAULT: token("brand-border"),
            dark: token("brand-border-dark"),
          },
          alert: token("brand-alert"),
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        card: "var(--shadow-card)",
        cardHover: "var(--shadow-card-hover)",
        dropdown: "var(--shadow-dropdown)",
      },
    },
  },
  plugins: [],
};

export default config;
