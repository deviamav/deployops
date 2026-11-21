/**
 * One quiet radial glow + a faint masked grid. Login / hero only —
 * never mounted behind dashboard content.
 */
export function AmbientBackdrop() {
  return (
    <div className="ambient-root" aria-hidden>
      <div className="ambient-glow" />
      <div className="ambient-grid" />
    </div>
  );
}
