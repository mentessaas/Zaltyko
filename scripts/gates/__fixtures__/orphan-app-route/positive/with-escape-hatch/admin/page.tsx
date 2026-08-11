// @orphan-app-route-ok reason: documentation example fixture, not a real route
// Positive: explicit escape hatch silences the gate so contributors do not
// fight the linter when seeding documentation-only fixtures.
export default function Page() {
  return <div>intentional audit exempt</div>;
}
