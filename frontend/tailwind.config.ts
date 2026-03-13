import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#00e68a",
          50: "#e6fff5",
          100: "#b3ffdb",
          200: "#80ffc2",
          300: "#4dffa8",
          400: "#1aff8f",
          500: "#00e68a",
          600: "#00b36b",
          700: "#00804d",
          800: "#004d2e",
          900: "#001a10",
        },
        surface: {
          DEFAULT: "#0d1117",
          50: "#161b22",
          100: "#1c2333",
          200: "#21283b",
          300: "#2d3548",
          400: "#3b4459",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-gradient":
          "linear-gradient(135deg, #0d1117 0%, #0a1628 50%, #0d1117 100%)",
        "card-gradient":
          "linear-gradient(180deg, rgba(0,230,138,0.03) 0%, rgba(0,230,138,0) 100%)",
        "glow-green":
          "radial-gradient(circle at 50% 0%, rgba(0,230,138,0.08) 0%, transparent 60%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0,230,138,0.15)",
        "glow-sm": "0 0 10px rgba(0,230,138,0.1)",
        card: "0 4px 24px rgba(0,0,0,0.3)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite alternate",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%": { boxShadow: "0 0 5px rgba(0,230,138,0.1)" },
          "100%": { boxShadow: "0 0 20px rgba(0,230,138,0.25)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
