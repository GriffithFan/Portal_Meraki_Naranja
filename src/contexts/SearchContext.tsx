"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface SearchContextType {
  headerSearch: string;
  setHeaderSearch: (q: string) => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function useSearchContext() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearchContext must be used within SearchProvider");
  return ctx;
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [headerSearch, setHeaderSearchRaw] = useState("");

  const setHeaderSearch = useCallback((q: string) => {
    setHeaderSearchRaw(q);
  }, []);

  return (
    <SearchContext.Provider value={{ headerSearch, setHeaderSearch }}>
      {children}
    </SearchContext.Provider>
  );
}
