"use client";
/**
 * PROMETHEUS — Multi-Leg Chain View
 * Gap #1: Shows shipment dependency chains as horizontal leg timelines.
 * Embedded into ShipmentList as a "Chain" sub-tab.
 * Compact, readable — no extra columns added.
 */
import { ShipmentChain, LEG_STAGE_LABEL, LEG_STATUS_STYLE } from "@/lib/multiLeg";

interface Props {
  chains: ShipmentChain[];
}

export function ChainView({ chains }: Props) {
  return (
    <div className="p-3 space-y-4">
      <div className="font-body text-[9px] text-lo px-1 leading-[1.5]">
        Multi-leg dependency chains. A delay in any leg propagates to all downstream stages.
      </div>

      {chains.map(chain => {
        const hasRisk = chain.legs.some(l => l.status === "at_risk" || l.status === "delayed");
        const borderCol = hasRisk ? "rgba(184,145,90,0.25)" : "rgba(40,44,62,0.6)";

        return (
          <div
            key={chain.shipmentId}
            className="bg-surface border p-3"
            style={{ borderRadius: "6px", borderColor: borderCol }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-[8px]">
              <span className="font-mono text-[10px] font-medium" style={{ color: "#8e96b4" }}>
                {chain.shipmentId}
              </span>
              <div className="flex items-center gap-3 font-mono text-[8px] text-lo">
                {chain.accumulatedDelayHours > 0 && (
                  <span style={{ color: "#b8915a" }}>+{chain.accumulatedDelayHours.toFixed(1)}h delay</span>
                )}
                <span>SLA {chain.overallSla}h</span>
              </div>
            </div>

            {/* Leg timeline — horizontal */}
            <div className="flex items-stretch gap-[2px] relative">
              {chain.legs.map((leg, i) => {
                const style = LEG_STATUS_STYLE[leg.status];
                const isActive = leg.status === "active" || leg.status === "at_risk";
                const label = LEG_STAGE_LABEL[leg.stage];
                const isLast = i === chain.legs.length - 1;

                return (
                  <div key={leg.legId} className="flex items-center flex-1 min-w-0">
                    <div
                      className="flex-1 min-w-0 px-[5px] py-[6px] border transition-all"
                      style={{
                        borderRadius: "4px",
                        borderColor: style.border,
                        background: style.bg,
                        outline: isActive ? `1px solid ${style.color}40` : "none",
                      }}
                    >
                      <div className="font-mono text-[7px] truncate" style={{ color: style.color }}>
                        {label}
                      </div>
                      <div className="font-mono text-[7px] text-lo truncate mt-[1px]">
                        {leg.plannedEnd}h
                      </div>
                      {leg.bufferHours === 0 && leg.status !== "complete" && (
                        <div className="font-mono text-[6.5px] mt-[1px]" style={{ color: "#b8915a" }}>
                          no slack
                        </div>
                      )}
                    </div>

                    {/* Connector arrow */}
                    {!isLast && (
                      <div className="flex-shrink-0 px-[2px]">
                        <span className="font-mono text-[8px]" style={{ color: "rgba(80,88,110,0.5)" }}>›</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Notes on active/risk legs */}
            {chain.legs.filter(l => l.notes && (l.status === "active" || l.status === "at_risk" || l.status === "delayed")).map(leg => (
              <div key={leg.legId + "-note"} className="mt-[5px] font-body text-[8.5px] leading-[1.4]"
                style={{ color: "rgba(184,145,90,0.7)" }}>
                {LEG_STAGE_LABEL[leg.stage]}: {leg.notes}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
