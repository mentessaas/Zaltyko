"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  UserCog,
  ClipboardCheck,
  CreditCard,
  BarChart3,
  Settings,
  Package,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    children: [
      { label: "Inbox", href: "/dashboard/inbox", icon: MessageSquare },
      { label: "Point of sale", href: "/dashboard/pos", icon: CreditCard },
    ],
  },
  { label: "Classes", href: "/dashboard/classes", icon: Calendar },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { label: "Community", href: "/dashboard/community", icon: Users },
  { label: "On-Demand", href: "/dashboard/on-demand", icon: Package },
  { label: "Memberships", href: "/dashboard/memberships", icon: CreditCard },
  { label: "Marketing", href: "/dashboard/marketing", icon: BarChart3 },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Studio set-up", href: "/dashboard/setup", icon: Settings },
  { label: "Apps & Integrations", href: "/dashboard/integrations", icon: Package },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href || pathname === "/dashboard/";
    }
    return pathname?.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zaltyko-border bg-zaltyko-bg-light">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-zaltyko-text-main">Zaltyko</span>
            <span className="rounded-full bg-zaltyko-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zaltyko-primary-dark">
              Pro
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-light text-primary-dark border-l-3 border-l-primary"
                        : "text-text-secondary hover:bg-bg hover:text-text-main"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                  {hasChildren && active && (
                    <div className="ml-7 mt-1 space-y-1">
                      {item.children?.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                              childActive
                                ? "bg-zaltyko-primary-light/50 text-zaltyko-primary-dark"
                                : "text-zaltyko-text-secondary hover:bg-zaltyko-bg hover:text-zaltyko-text-main"
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}

