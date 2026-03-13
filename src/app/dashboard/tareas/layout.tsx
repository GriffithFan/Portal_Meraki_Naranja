"use client";

import EspaciosSidebar from "@/components/espacios/EspaciosSidebar";

export default function TareasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row -mx-3 sm:-mx-4 md:-mx-6 -mb-3 sm:-mb-4 md:-mb-6 min-h-[calc(100vh-64px-48px)] md:h-[calc(100vh-64px-48px)]">
      <EspaciosSidebar />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">{children}</div>
    </div>
  );
}
