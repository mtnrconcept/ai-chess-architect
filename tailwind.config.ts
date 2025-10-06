import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        'chess-light': "hsl(var(--chess-board-light))",
        'chess-dark': "hsl(var(--chess-board-dark))",
        'gold': "hsl(var(--gold-accent))",
      },
      backgroundImage: {
        'gradient-premium': 'var(--gradient-premium)',
        'gradient-gold': 'var(--gradient-gold)',
        'neon-grid': 'radial-gradient(circle at 20% 20%, rgba(34, 211, 238, 0.25) 0, transparent 55%), radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.3) 0, transparent 55%), radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.25) 0, transparent 55%), radial-gradient(circle at 80% 80%, rgba(250, 204, 21, 0.2) 0, transparent 55%)',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'card-custom': 'var(--shadow-card)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        neonPulse: {
          '0%, 100%': {
            opacity: '0.55',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.55)',
          },
          '50%': {
            opacity: '0.9',
            boxShadow: '0 0 40px rgba(236, 72, 153, 0.75)',
          },
        },
        neonShimmer: {
          '0%': {
            transform: 'translateX(-120%) rotate(8deg)',
            opacity: '0',
          },
          '50%': {
            opacity: '0.35',
          },
          '100%': {
            transform: 'translateX(120%) rotate(8deg)',
            opacity: '0',
          },
        },
        float: {
          '0%, 100%': {
            transform: 'translateY(-4px)',
          },
          '50%': {
            transform: 'translateY(4px)',
          },
        },
        ripple: {
          '0%': {
            transform: 'scale(0.7)',
            opacity: '0.75',
          },
          '70%': {
            opacity: '0',
          },
          '100%': {
            transform: 'scale(1.6)',
            opacity: '0',
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        neonPulse: 'neonPulse 3s ease-in-out infinite',
        neonShimmer: 'neonShimmer 8s linear infinite',
        float: 'float 6s ease-in-out infinite',
        ripple: 'ripple 1.8s ease-out infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
