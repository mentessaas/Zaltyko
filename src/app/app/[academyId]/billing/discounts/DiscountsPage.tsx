"use client";

import { useState } from "react";
import { Link } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DiscountManager } from "@/components/billing/DiscountManager";
import { CampaignManager } from "@/components/billing/CampaignManager";

interface DiscountsPageProps {
  academyId: string;
}

export function DiscountsPage({ academyId }: DiscountsPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Descuentos y Campañas</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona códigos promocionales, descuentos y campañas
          </p>
        </div>
      </div>

      <Tabs defaultValue="discounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="discounts">Descuentos</TabsTrigger>
          <TabsTrigger value="campaigns">Campañas</TabsTrigger>
        </TabsList>

        <TabsContent value="discounts">
          <DiscountManager academyId={academyId} />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignManager academyId={academyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
