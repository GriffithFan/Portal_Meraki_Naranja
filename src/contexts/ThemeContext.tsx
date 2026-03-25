"use client";

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";

export function useTheme() {
  const { resolvedTheme, setTheme } = useNextTheme();
  return {
    theme: (resolvedTheme === "dark" ? "dark" : "light") as "light" | "dark",
    toggleTheme: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
