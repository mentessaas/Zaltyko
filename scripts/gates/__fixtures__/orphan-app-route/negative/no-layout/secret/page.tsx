// Negative: sibling leak shape — no parent layout, no auth on the page.
// Even if the page did not call into the database, it would still expose
// whatever this component renders under /app/secret.
export default function Page() {
  return <div>unauthenticated content</div>;
}
