// Este layout no incluye AppProviders para permitir Server Components
export default function ServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

