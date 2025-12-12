"use client";

import { Bell, HelpCircle, ShoppingCart, UserPlus, MoreVertical } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardTopbarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  onNewCustomer?: () => void;
  onPOS?: () => void;
}

export function DashboardTopbar({
  userName = "Usuario",
  userEmail,
  userAvatar,
  onNewCustomer,
  onPOS,
}: DashboardTopbarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-zaltyko-border bg-zaltyko-bg-light">
      <div className="flex h-full items-center justify-between px-6">
        {/* Left side - empty for now, can add search or breadcrumbs */}
        <div className="flex-1" />

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <HelpCircle className="h-4 w-4" strokeWidth={1.8} />
          </Button>
          {onPOS && (
            <Button variant="outline" size="sm" onClick={onPOS} className="h-9">
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.8} />
              POS
            </Button>
          )}
          {onNewCustomer && (
            <Button variant="default" size="sm" onClick={onNewCustomer} className="h-9">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.8} />
              New customer
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <MoreVertical className="h-4 w-4" strokeWidth={1.8} />
          </Button>

          {/* User Avatar */}
          <div className="ml-2 flex items-center gap-2 pl-2 border-l border-zaltyko-border">
            <Avatar className="h-8 w-8 border border-zaltyko-border">
              <AvatarImage src={userAvatar} />
              <AvatarFallback className="text-xs bg-zaltyko-primary-light text-zaltyko-primary-dark">
                {userName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-zaltyko-text-main">{userName}</p>
              {userEmail && <p className="text-xs text-zaltyko-text-secondary">{userEmail}</p>}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

