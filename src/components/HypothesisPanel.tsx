"use client";
import { Hypothesis } from "@/lib/types";

function ProbBar({ val, color }: { val: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-[5px]">
      <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: "#1a1d2a" }}>
        <div className="h-full fill-bar rounded-full" style={{ width: `${val * 100}%`, background: color }} />
      </div>
      <span className="font-mono text-[8.5px] w-7 text-right tabular-nums" style={{ color }}>{(val * 100).toFixed(0)}%</span>
    </div>
  );
}

export function HypothesisPanel({ hypotheses }: { hypotheses: Hypothesis[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-[12px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div>
          <div className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Reason
          </div>
          <div className="font-mono text-[10px] mt-[2px]" style={{ color: "#404660" }}>Active hypotheses</div>
        </div>
        <span className="font-mono text-[12px] font-medium" style={{ color: "#5a6070" }}>{hypotheses.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-[4px]">
        {hypotheses.length === 0 && (
          <div className="flex items-center justify-center h-16">
            <div className="font-mono text-[8.5px]" style={{ color: "#404660" }}>Reasoning idle</div>
          </div>
        )}
        {hypotheses.map(h => {
          const p = h.breachProbability;
          const col = p > 0.7 ? "#c06080" : p > 0.45 ? "#c09060" : "#5a6898";
          const bgCol = p > 0.7 ? "rgba(160,64,96,0.05)" : p > 0.45 ? "rgba(176,128,64,0.04)" : "rgba(90,104,152,0.04)";
          const bdCol = p > 0.7 ? "rgba(160,64,96,0.2)" : p > 0.45 ? "rgba(176,128,64,0.18)" : "rgba(90,104,152,0.15)";

          return (
            <div key={h.id} className="p-[14px] border card-in"
              style={{ borderRadius: "6px", background: bgCol, borderColor: bdCol }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 mb-[4px]">
                    <span className="font-mono text-[11px] font-semibold" style={{ color: col }}>{h.entityId}</span>
                    <span className="font-body text-[9px] px-[6px] py-[1.5px] border"
                      style={{ borderRadius: "3px", color: "#404660", borderColor: "#1e2230" }}>
                      {h.entityType.replace("_", " ")}
                    </span>
                    {(h as { llmPowered?: boolean }).llmPowered && (
                      <span className="font-mono text-[8px] px-[5px] py-[1.5px] border"
                        style={{ borderRadius: "3px", color: "#9a78b8", borderColor: "rgba(106,88,136,0.3)", background: "rgba(106,88,136,0.07)" }}>
                        🧠
                      </span>
                    )}
                  </div>
                  <div className="font-display text-[12.5px] font-medium leading-[1.3]" style={{ color: "#a0a8c0" }}>
                    {h.pattern}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-display text-[20px] font-semibold leading-none tabular-nums" style={{ color: col }}>
                    {(p * 100).toFixed(0)}%
                  </div>
                  <div className="font-mono text-[8.5px] mt-[3px]" style={{ color: "#404660" }}>breach</div>
                </div>
              </div>

              <div className="font-body text-[10.5px] leading-[1.45] mt-[6px]" style={{ color: "#505878" }}>
                {h.rootCause}
              </div>

              <ProbBar val={h.confidence} color={col} />

              <div className="flex flex-wrap gap-x-4 mt-[6px] font-mono text-[9px]" style={{ color: "#404660" }}>
                <span>T-impact <span style={{ color: "#6a7090" }}>{h.timeToImpact.toFixed(1)}h</span></span>
                {h.cascadeRisk.length > 0 && <span>cascade <span style={{ color: "#b08040" }}>{h.cascadeRisk.length}</span></span>}
                {h.antibodyMatch && <span>antibody <span style={{ color: "#6a5888" }}>{h.antibodyMatch}</span></span>}
              </div>

              {(h as { llmRationale?: string }).llmRationale && (
                <div className="mt-[5px] px-[8px] py-[5px] border font-body text-[8px] leading-[1.5]"
                  style={{ borderRadius: "4px", color: "rgba(154,120,184,0.8)", borderColor: "rgba(106,88,136,0.2)", background: "rgba(106,88,136,0.04)" }}>
                  {(h as { llmRationale?: string }).llmRationale}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
