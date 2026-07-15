"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { SearchProvider } from "@/contexts/SearchContext";
import PushNotificationRegistrar from "@/components/PushNotificationRegistrar";
import CommandPalette from "@/components/CommandPalette";
import ChatFloatingWidget from "@/components/ChatFloatingWidget";
import AnunciosBloqueantes from "@/components/AnunciosBloqueantes";
import AnunciosToast from "@/components/AnunciosToast";
import { AnunciosProvider } from "@/contexts/AnunciosContext";
import OcultarParaPersonalOnly from "@/components/OcultarParaPersonalOnly";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useIdleTimeout();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <SearchProvider>
      <NetworkProvider>
        <AnunciosProvider>
        {/* Piezas del caparazón que NO deben existir para cuentas solo-Personal. */}
        <OcultarParaPersonalOnly>
          <PushNotificationRegistrar />
          <CommandPalette />
          <AnunciosBloqueantes />
          <AnunciosToast />
        </OcultarParaPersonalOnly>
        <div className="flex min-h-screen bg-surface-50">
          <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
          <div className="flex-1 flex flex-col min-w-0">
            <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />
            <main className="dashboard-main flex-1 p-3 sm:p-4 lg:p-5 2xl:p-6">
              <Breadcrumbs />
              {children}
            </main>
            <OcultarParaPersonalOnly>
              <ChatFloatingWidget />
            </OcultarParaPersonalOnly>
          </div>
        </div>
        </AnunciosProvider>
      </NetworkProvider>
      </SearchProvider>
    </SessionProvider>
    </QueryClientProvider>
  );
}
