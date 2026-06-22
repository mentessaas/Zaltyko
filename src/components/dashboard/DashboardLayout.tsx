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
    <div className="flex min-h-screen bg-zaltyko-bg">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
        <DashboardTopbar
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
          onNewCustomer={onNewCustomer}
          onPOS={onPOS}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:p-8">
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
