"use client";

import { QueryClient } from "@tanstack/react-query";

let client: QueryClient | undefined;

export function getQueryClient() {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return client;
}
