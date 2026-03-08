"use client";
/**
 * PROMETHEUS — Monte Carlo Shadow Distribution View
 * Gap #6: Replaces the dual "scalar shadowEta" with a real distribution.
 * Shown as a compact probability bar per shipment in the map overlay.
 * Also embedded as a data table in ShipmentList.
 */
import { MonteCarloResult } from "@/lib/monteCarlo";

interface Props {
  results: Map<string, MonteCarloResult>;
  shipIds: string[];
}

function MiniDistribution({ buckets, sla, mean }: { buckets: number[]; sla: number; mean: number }) {
  const max = Math.max(...buckets, 1);
  return (
    <div className="flex items-end gap-[1px] h-[16px]">
      {buckets.map((b, i) => (
        <div
          key={i}
          className="flex-1"
          style={{
            height: `${(b / max) * 100}%`,
            minHeight: b > 0 ? "2px" : "0",
            background: i > buckets.length * 0.75
              ? "rgba(168,84,104,0.5)"
              : "rgba(74,173,163,0.35)",
            borderRadius: "1px",
          }}
        />
      ))}
    </div>
  );
}

export function MonteCarloView({ results, shipIds }: Props) {
  if (results.size === 0) {
    return (
      <div className="p-3">
        <div className="font-mono text-[9px] text-lo text-center py-8">
          Run agent cycle to compute distributions
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-[6px]">
      <div className="font-body text-[9px] text-lo px-1 mb-3 leading-[1.5]">
        50-iteration Monte Carlo per shipment. P10/P50/P90 ETAs with breach probability.
      </div>

      {shipIds.map(id => {
        const r = results.get(id);
        if (!r) return null;
        const breachPct = (r.breachProbability * 100).toFixed(0);
        const breachCol = r.breachProbability > 0.6 ? "#a85468"
          : r.breachProbability > 0.3 ? "#b8915a" : "#5a9e74";

        return (
          <div
            key={id}
            className="bg-surface border border-border p-3"
            style={{ borderRadius: "5px" }}
          >
            {/* Row 1: ID + breach prob */}
            <div className="flex items-center justify-between mb-[6px]">
              <span className="font-mono text-[9.5px] font-medium" style={{ color: "#8e96b4" }}>{id}</span>
              <span className="font-mono text-[9px] font-medium" style={{ color: breachCol }}>
                {breachPct}% breach
              </span>
            </div>

            {/* Distribution sparkline */}
            <MiniDistribution buckets={r.distributionBuckets} sla={0} mean={r.mean} />

            {/* P10 / P50 / P90 */}
            <div className="flex items-center justify-between mt-[5px] font-mono text-[8px]">
              <span className="text-lo">P10 <span style={{ color: "#5a9e74" }}>{r.p10.toFixed(1)}h</span></span>
              <span className="text-lo">P50 <span style={{ color: "#8e96b4" }}>{r.p50.toFixed(1)}h</span></span>
              <span className="text-lo">P90 <span style={{ color: "#b8915a" }}>{r.p90.toFixed(1)}h</span></span>
              <span className="text-lo">worst <span style={{ color: "#a85468" }}>{r.worstCaseEta.toFixed(1)}h</span></span>
            </div>

            {/* Progress bar showing P50 vs worst */}
            <div className="mt-[5px] h-[2px] bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (r.p50 / r.worstCaseEta) * 100)}%`,
                  background: breachCol,
                  opacity: 0.6,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
