"use client";

import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  onNewCustomer?: () => void;
  onPOS?: () => void;
}

export function DashboardLayout({
  children,
  userName,
  userEmail,
  userAvatar,
  onNewCustomer,
  onPOS,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-zaltyko-bg">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col ml-64">
        <DashboardTopbar
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
          onNewCustomer={onNewCustomer}
          onPOS={onPOS}
        />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

