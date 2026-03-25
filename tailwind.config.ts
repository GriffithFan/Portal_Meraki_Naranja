import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /**
         * ── BACKUP paletas anteriores (restaurar si no gustan las nuevas) ──
         *
         * primary (Tailwind Blue):
         *   50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
         *   400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
         *   800: "#1e40af", 900: "#1e3a8a", 950: "#172554"
         *
         * accent (Tailwind Orange):
         *   50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
         *   400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c",
         *   800: "#9a3412", 900: "#7c2d12", 950: "#431407"
         *
         * surface (Tailwind Slate):
         *   50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1",
         *   400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155",
         *   800: "#1e293b", 900: "#0f172a", 950: "#020617"
         */

        // Paleta principal: Cerulean Blue (azul vibrante)
        primary: {
          50:  "#ecf8ff",
          100: "#d4efff",
          200: "#b2e3ff",
          300: "#7dd4ff",
          400: "#40bbff",
          500: "#149bff",
          600: "#0082ff",
          700: "#0075ff",
          800: "#0058cc",
          900: "#084da0",
          950: "#0a2f61",
        },
        // Paleta secundaria: Grenadier (naranja cálido)
        accent: {
          50:  "#fff8ec",
          100: "#ffeed2",
          200: "#ffdaa4",
          300: "#ffbf6b",
          400: "#ff982f",
          500: "#ff7b07",
          600: "#f96300",
          700: "#cc4700",
          800: "#a33809",
          900: "#83300b",
          950: "#471603",
        },
        // Paleta neutra: blue-tinted slate (complementa Cerulean)
        surface: {
          50:  "#f5f8fc",
          100: "#eaf0f7",
          200: "#d6dfeb",
          300: "#b4c4d8",
          400: "#8a9fba",
          500: "#637d9b",
          600: "#4a6180",
          700: "#3a4d66",
          800: "#1e3348",
          900: "#112338",
          950: "#091526",
        },
        // Colores shadcn/ui (CSS variables)
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        destructive: { DEFAULT: "var(--destructive)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "soft": "0 2px 8px -2px rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.06)",
        "soft-lg": "0 4px 16px -4px rgba(0,0,0,0.1), 0 2px 6px -2px rgba(0,0,0,0.06)",
        "glow": "0 0 20px -5px rgba(20,155,255,0.3)",
        "glow-accent": "0 0 20px -5px rgba(255,123,7,0.3)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "fade-in-up": "fadeInUp 0.6s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scaleIn 0.2s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
        "shake": "shake 0.5s ease-in-out",
        "spin-slow": "spin 2s linear infinite",
        "float-slow": "floatSlow 8s ease-in-out infinite",
        "float-slow-reverse": "floatSlowReverse 10s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "count-up": "countUp 0.6s cubic-bezier(0.16,1,0.3,1)",
        "card-enter": "cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-30px) scale(1.05)" },
        },
        floatSlowReverse: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(20px) scale(0.95)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        cardEnter: {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
