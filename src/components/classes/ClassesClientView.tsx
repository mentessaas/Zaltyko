"use client";

interface ClassesClientViewProps {
  academyId: string;
}

export function ClassesClientView({ academyId }: ClassesClientViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Cargando clases...
      </p>
    </div>
  );
}
