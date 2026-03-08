"use client";
import { Signal } from "@/lib/types";

const SEV: Record<string, { dot: string; label: string; bg: string; border: string; text: string }> = {
  critical: { dot: "#a04060", label: "Critical", bg: "rgba(160,64,96,0.07)", border: "rgba(160,64,96,0.22)", text: "#c06080" },
  high: { dot: "#b08040", label: "High", bg: "rgba(176,128,64,0.07)", border: "rgba(176,128,64,0.2)", text: "#c09060" },
  medium: { dot: "#5a6898", label: "Medium", bg: "rgba(90,104,152,0.05)", border: "rgba(90,104,152,0.15)", text: "#7080a8" },
  low: { dot: "#404660", label: "Low", bg: "transparent", border: "rgba(30,34,48,0.7)", text: "#505870" },
};

const TYPE_ICON: Record<string, string> = {
  eta_drift: "⟳",
  sla_breach_imminent: "⚠",
  carrier_degradation: "↓",
  route_jam: "⬡",
  inventory_risk: "□",
  weather_impact: "◇",
  temperature_spike: "▲",
  throughput_drop: "↘",
  rain_event: "◈",
  degradation_trend: "~",
  warehouse_congestion: "▪",
  intake_clearance_imbalance: "⇅",
  cold_chain_risk: "❄",
  chain_delay_accumulation: "⋯",
  pickup_window_risk: "⏱",
  zero_buffer_handoff: "→",
  leg_delay_cascade: "⋙",
};

export function SignalPanel({ signals }: { signals: Signal[] }) {
  const critCount = signals.filter(s => s.severity === "critical").length;
  const highCount = signals.filter(s => s.severity === "high").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-[12px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="font-display text-[14px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
              Observe
            </div>
            <div className="font-mono text-[11px] mt-[2px]" style={{ color: "#404660" }}>Live signal feed</div>
          </div>
          {critCount > 0 && (
            <span className="font-mono text-[10px] px-[8px] py-[2.5px] border soft-pulse"
              style={{ borderRadius: "4px", color: "#c06080", borderColor: "rgba(160,64,96,0.3)", background: "rgba(160,64,96,0.07)" }}>
              {critCount} critical
            </span>
          )}
        </div>
        <span className="font-mono text-[13px] font-medium" style={{ color: "#5a6070" }}>{signals.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-[3px]">
        {signals.length === 0 && (
          <div className="flex flex-col items-center justify-center h-16 gap-2">
            <div className="w-1.5 h-1.5 rounded-full animate-breathe" style={{ background: "#4a8e64" }} />
            <div className="font-mono text-[8.5px]" style={{ color: "#404660" }}>No anomalies</div>
          </div>
        )}
        {signals.map(sig => {
          const s = SEV[sig.severity] ?? SEV.low;
          const icon = TYPE_ICON[sig.type] ?? "·";
          return (
            <div key={sig.id} className="px-4 py-[10px] border card-in"
              style={{ borderRadius: "6px", background: s.bg, borderColor: s.border }}>
              <div className="flex items-center gap-[8px] mb-[3px]">
                <span className="text-[13px] font-mono flex-shrink-0" style={{ color: s.dot }}>{icon}</span>
                <span className="font-mono text-[11px] font-medium" style={{ color: s.text }}>
                  {sig.type.replace(/_/g, " ")}
                </span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: "#404660" }}>{sig.source}</span>
              </div>
              <div className="font-body text-[10.5px] leading-[1.45] pl-[21px]" style={{ color: "#6a7090" }}>
                {sig.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
