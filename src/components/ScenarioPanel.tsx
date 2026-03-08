"use client";
/**
 * PROMETHEUS — Scenario Injection Panel
 * Fix #10: Judges can trigger named failure scenarios on demand.
 * Previously there was no way to demo dramatic agent responses.
 */
import { SCENARIOS } from "@/lib/scenarios";

interface Props {
  onInject: (scenarioId: string) => void;
  lastInjected?: string;
}

const SEV_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  critical: { border: "rgba(168,84,104,0.35)", bg: "rgba(168,84,104,0.07)", label: "#a85468" },
  high:     { border: "rgba(184,145,90,0.35)",  bg: "rgba(184,145,90,0.07)",  label: "#b8915a" },
  medium:   { border: "rgba(74,173,163,0.3)",   bg: "rgba(74,173,163,0.06)", label: "#4aada3" },
};

export function ScenarioPanel({ onInject, lastInjected }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="font-display text-[11px] font-semibold tracking-[0.12em] text-hi uppercase">Scenarios</div>
          <div className="font-mono text-[8px] text-lo mt-[2px]">Inject failure events</div>
        </div>
        <span className="font-mono text-[8px]" style={{ color: "rgba(168,84,104,0.7)" }}>DEMO MODE</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-[6px]">
        <div className="font-body text-[9px] text-lo leading-[1.5] mb-3 px-1">
          Inject a live failure event to trigger the agent loop. Watch PROMETHEUS observe, reason, and respond in real time.
        </div>

        {SCENARIOS.map(sc => {
          const sev = SEV_COLORS[sc.severity] ?? SEV_COLORS.medium;
          const isActive = lastInjected === sc.id;

          return (
            <button
              key={sc.id}
              onClick={() => onInject(sc.id)}
              className="w-full text-left p-3 border transition-all hover:opacity-90 active:scale-[0.99]"
              style={{
                borderRadius: "6px",
                borderColor: isActive ? sev.label : sev.border,
                background: isActive ? sev.bg : "rgba(255,255,255,0.01)",
                outline: isActive ? `1px solid ${sev.label}` : "none",
              }}
            >
              <div className="flex items-center justify-between mb-[4px]">
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{sc.icon}</span>
                  <span className="font-display text-[10px] font-semibold tracking-[0.06em] text-hi">{sc.name}</span>
                </div>
                <span
                  className="font-mono text-[7px] px-[5px] py-[1px] border"
                  style={{ borderRadius: "2px", color: sev.label, borderColor: sev.border, background: sev.bg }}
                >
                  {sc.severity}
                </span>
              </div>
              <div className="font-body text-[9px] leading-[1.4]" style={{ color: "rgba(142,150,180,0.65)" }}>
                {sc.description}
              </div>
              {isActive && (
                <div className="mt-2 font-mono text-[8px]" style={{ color: sev.label }}>
                  ✓ Injected — agent responding…
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
