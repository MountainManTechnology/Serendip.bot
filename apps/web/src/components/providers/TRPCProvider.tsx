"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";

function getApiUrl() {
  if (typeof window !== "undefined") {
    return process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  }
  return process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getApiUrl()}/trpc`,
          fetch(url, options) {
            // Cast required: exactOptionalPropertyTypes mismatch between tRPC and fetch RequestInit
            return fetch(url, {
              ...options,
              credentials: "include",
            } as RequestInit);
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
