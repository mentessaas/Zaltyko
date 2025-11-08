interface SchemaProps {
  json: Record<string, unknown>;
}

export function Schema({ json }: SchemaProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
