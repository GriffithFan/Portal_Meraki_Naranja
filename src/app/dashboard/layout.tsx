"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { SearchProvider } from "@/contexts/SearchContext";
import PushNotificationRegistrar from "@/components/PushNotificationRegistrar";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useIdleTimeout();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <SessionProvider>
      <SearchProvider>
      <NetworkProvider>
        <PushNotificationRegistrar />
        <div className="flex min-h-screen bg-surface-50">
          <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
          <div className="flex-1 flex flex-col min-w-0">
            <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />
            <main className="flex-1 p-3 sm:p-4 md:p-6">
              <Breadcrumbs />
              {children}
            </main>
          </div>
        </div>
      </NetworkProvider>
      </SearchProvider>
    </SessionProvider>
  );
}
