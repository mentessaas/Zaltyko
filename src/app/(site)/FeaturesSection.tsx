"use client";

import { useState } from "react";
import { Users, CalendarClock, ClipboardCheck, CreditCard, Database, Check } from "lucide-react";
import { ESSENTIAL_FEATURES } from "@/lib/launch/essential-public-catalog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function FeaturesSection() {
  const icons = [Users, CalendarClock, ClipboardCheck, CreditCard, Database];
  const features = ESSENTIAL_FEATURES.map((feature, index) => ({
    ...feature,
    icon: icons[index],
    content: feature,
  }));
  const [activeFeature, setActiveFeature] = useState(features[0].id);

  return (
    <section className="bg-zaltyko-primary-dark py-20 px-4 text-white">
      <div className="mx-auto max-w-6xl">
        <Tabs value={activeFeature} onValueChange={setActiveFeature} className="w-full">
          <TabsList className="mb-10 flex h-auto flex-wrap justify-center gap-4 bg-transparent">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <TabsTrigger
                  key={feature.id}
                  value={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className="flex min-w-[140px] flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-4 font-sans text-sm font-medium text-white/70 transition data-[state=active]:border-white data-[state=active]:bg-white/15 data-[state=active]:text-white"
                >
                  <Icon className="h-6 w-6" />
                  <span>{feature.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {features.map((feature) => (
            <TabsContent
              key={feature.id}
              value={feature.id}
              className="space-y-8 rounded-xl border border-white/10 border-t-[3px] border-t-white bg-white/5 p-8"
            >
              <div className="space-y-6">
                <h3 className="font-display text-3xl font-black uppercase leading-none text-white">
                  {feature.content.title}
                </h3>
                <p className="floor-label text-mat-lane">
                  Impacto
                </p>
                <p className="font-sans text-base text-white/70">
                  {feature.content.impact}
                </p>
                <div className="grid gap-4 pt-6 md:grid-cols-2">
                  {feature.content.features.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-md border border-white/10 bg-white/5 p-4"
                    >
                      <Check className="mt-1 h-5 w-5 flex-shrink-0 text-mat-lane" />
                      <span className="font-sans text-sm leading-relaxed text-white/80">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
