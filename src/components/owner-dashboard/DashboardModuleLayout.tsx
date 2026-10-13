"use client";

import {
  Children,
  isValidElement,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";

import {
  DEFAULT_OWNER_DASHBOARD_ORDER,
  OWNER_DASHBOARD_MODULES,
  type OwnerDashboardModule,
} from "@/modules/owner-dashboard/domain/dashboard-layout";

type ModuleDefinitionProps = {
  moduleId: OwnerDashboardModule;
  title: string;
  children: ReactNode;
};

type LayoutProps = {
  organizationId: string;
  initialOrder: OwnerDashboardModule[];
  initialVersion: number;
  enabled?: boolean;
  children: ReactNode;
};

export function DashboardModule({ children }: ModuleDefinitionProps) {
  return <>{children}</>;
}

function SortableModule({
  id,
  title,
  children,
  index,
  count,
  saving,
  onMove,
}: {
  id: OwnerDashboardModule;
  title: string;
  children: ReactNode;
  index: number;
  count: number;
  saving: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: saving });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`min-w-0 ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3 border-b border-slate-300">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
          {title}
        </h2>
        <div className="flex items-center gap-1" role="group" aria-label={`Ordenar ${title}`}>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            disabled={saving}
            aria-label={`Arrastrar ${title} para cambiar su posición`}
            title="Arrastra para cambiar de posición"
            className="touch-target inline-flex items-center justify-center text-slate-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:opacity-50"
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={saving || index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Subir ${title}`}
            className="touch-target inline-flex items-center justify-center text-slate-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={saving || index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Bajar ${title}`}
            className="touch-target inline-flex items-center justify-center text-slate-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:opacity-40"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export function DashboardModuleLayout({
  organizationId,
  initialOrder,
  initialVersion,
  enabled = true,
  children,
}: LayoutProps) {
  const modules = useMemo(
    () =>
      Children.toArray(children).flatMap((child) => {
        if (!isValidElement<ModuleDefinitionProps>(child)) return [];
        const { moduleId, title } = child.props;
        if (!OWNER_DASHBOARD_MODULES.includes(moduleId)) return [];
        return [{ id: moduleId, title, content: child.props.children }];
      }),
    [children]
  );
  const moduleIds = modules.map((module) => module.id);
  const validInitialOrder = initialOrder.filter((id) => moduleIds.includes(id));
  const normalizedInitialOrder = [
    ...validInitialOrder,
    ...moduleIds.filter((id) => !validInitialOrder.includes(id)),
  ];
  const [order, setOrder] = useState<OwnerDashboardModule[]>(
    normalizedInitialOrder.length
      ? normalizedInitialOrder
      : [...DEFAULT_OWNER_DASHBOARD_ORDER]
  );
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const moduleById = new Map(modules.map((module) => [module.id, module]));

  if (!enabled) {
    return (
      <div className="mt-8 space-y-9">
        {normalizedInitialOrder.map((id) => {
          const dashboardSection = moduleById.get(id);
          return dashboardSection ? <div key={id}>{dashboardSection.content}</div> : null;
        })}
      </div>
    );
  }

  async function saveOrder(nextOrder: OwnerDashboardModule[]) {
    if (saving) return;
    const previousOrder = order;
    setOrder(nextOrder);
    setSaving(true);
    setStatus("Guardando orden…");
    try {
      const response = await fetch("/api/v1/owner/dashboard-layout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          order: nextOrder,
          expectedVersion: version,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { version?: number; detail?: string }
        | null;
      if (!response.ok || typeof result?.version !== "number") {
        throw new Error(
          result?.detail ?? "No se pudo guardar el orden. Vuelve a intentarlo."
        );
      }
      setVersion(result.version);
      setStatus("Orden guardado para tu cuenta.");
    } catch (error) {
      setOrder(previousOrder);
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el orden. Vuelve a intentarlo."
      );
    } finally {
      setSaving(false);
    }
  }

  function moveModule(id: OwnerDashboardModule, direction: -1 | 1) {
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    void saveOrder(arrayMove(order, index, target));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(active.id as OwnerDashboardModule);
    const to = order.indexOf(over.id as OwnerDashboardModule);
    if (from < 0 || to < 0) return;
    void saveOrder(arrayMove(order, from, to));
  }

  return (
    <section aria-label="Módulos del Owner Dashboard" className="mt-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          Organiza el panel a tu manera. Tu orden no cambia permisos ni datos.
        </p>
        <button
          type="button"
          disabled={saving || order.every((id, index) => id === moduleIds[index])}
          onClick={() => void saveOrder(moduleIds)}
          className="touch-target inline-flex items-center gap-2 text-xs font-bold text-teal-800 underline underline-offset-4 disabled:text-slate-500"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Restablecer orden
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={order}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-9">
            {order.map((id, index) => {
              const dashboardSection = moduleById.get(id);
              if (!dashboardSection) return null;
              return (
                <SortableModule
                  key={id}
                  id={id}
                  title={dashboardSection.title}
                  index={index}
                  count={order.length}
                  saving={saving}
                  onMove={(direction) => moveModule(id, direction)}
                >
                  {dashboardSection.content}
                </SortableModule>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
