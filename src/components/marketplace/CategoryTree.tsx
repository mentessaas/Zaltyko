"use client";

type Category = {
  id: string;
  slug: string;
  nameEs: string;
  icon: string | null;
  parentId: string | null;
  children?: Category[];
};

export function CategoryTree({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <nav
      aria-label="Categorías"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 16,
      }}
    >
      <Chip
        label="Todas"
        active={selectedId === ""}
        onClick={() => onSelect("")}
      />
      {categories.map((c) => (
        <CategoryNode
          key={c.id}
          node={c}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function CategoryNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: Category;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const isActive = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Chip
        label={`${node.icon ? node.icon + " " : ""}${node.nameEs}`}
        active={isActive}
        onClick={() => onSelect(node.id)}
        depth={depth}
      />
      {hasChildren && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginLeft: depth === 0 ? 8 : 0,
          }}
        >
          {node.children!.map((c) => (
            <CategoryNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  depth,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  depth?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "4px 10px",
        background: active ? "#0f172a" : "white",
        color: active ? "white" : "#475569",
        border: "1px solid #e2e8f0",
        borderRadius: 100,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
