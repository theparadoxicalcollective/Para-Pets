import type { ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import App from "./App";
import AuthPage from "@/pages/AuthPage";
import LoadingScreen from "@/components/LoadingScreen";
import { queryClient } from "./lib/queryClient";
import GameFrame from "@/components/GameFrame";

function RootStage({ children }: { children: ReactNode }) {
  return <GameFrame>{children}</GameFrame>;
}

function RootAuthGate() {
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5_000,
    refetchInterval: 1_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(`Authentication validation failed (${response.status})`);
      return response.json();
    },
  });

  if (user) return <App />;

  if (isLoading) {
    return (
      <RootStage>
        <LoadingScreen label="Loading…" />
      </RootStage>
    );
  }

  return (
    <RootStage>
      <AuthPage />
    </RootStage>
  );
}

function RootEntryInner() {
  const [location] = useLocation();

  // /auth remains a compatibility alias for old links, but the public sign-in
  // experience has a single canonical address: parapets.net/.
  if (location === "/auth") return <Redirect to="/" />;
  if (location === "/") return <RootAuthGate />;

  return <App />;
}

export default function RootEntry() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootEntryInner />
    </QueryClientProvider>
  );
}
