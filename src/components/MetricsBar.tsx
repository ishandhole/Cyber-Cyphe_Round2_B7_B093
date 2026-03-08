"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LoopStage } from "@/lib/types";

const STAGES: { id: LoopStage; label: string; short: string; color: string }[] = [
  { id: "OBSERVE", label: "Observe", short: "OBS", color: "#3d9e95" },
  { id: "REASON", label: "Reason", short: "RSN", color: "#b08040" },
  { id: "DECIDE", label: "Decide", short: "DEC", color: "#8892b0" },
  { id: "ACT", label: "Act", short: "ACT", color: "#4a8e64" },
  { id: "LEARN", label: "Learn", short: "LRN", color: "#6a5888" },
];

export type AppTab = "TRACK" | "THINK" | "VERIFY";

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  slaPreserved: number; breachCount: number; autoActions: number; escalations: number;
  totalSaved: number; divergence: number; cycleCount: number; agentRunning: boolean;
  activeStage: LoopStage | null; cycleMs: number; raining: boolean;
  onToggle: () => void; onRain: () => void;
  llmEnabled?: boolean; onToggleLlm?: () => void;
}

export function MetricsBar(p: Props) {
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const f = (x: number) => String(x).padStart(2, "0");
      setClock(`${f(n.getHours())}:${f(n.getMinutes())}:${f(n.getSeconds())}`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  const divCol = p.divergence > 0.35 ? "#a04060" : p.divergence > 0.2 ? "#b08040" : "#4a8e64";

  return (
    <nav className="glass-panel px-4 py-2.5 flex items-center justify-between rounded-2xl fixed top-6 left-6 right-6 z-[100]"
      style={{ border: "1px solid rgba(61,158,149,0.2)" }}>

      {/* LEFT: Logo & Loop */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 border-2 border-teal/40 rotate-45" style={{ borderRadius: "5px" }} />
            <div className="absolute inset-[8px] bg-teal/30 rotate-45" style={{ borderRadius: "1.5px" }} />
          </div>
          <div>
            <div className="font-display text-[14px] font-bold tracking-[0.2em] text-hi leading-none">PROMETHEUS</div>
            <div className="font-mono text-[9px] tracking-[0.05em] mt-[3px] leading-none opacity-40 uppercase">Intelligence System</div>
          </div>
        </div>

        <div className="h-8 w-px bg-border/20 mx-1" />

        <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0"
          style={{ background: "rgba(13,15,24,0.5)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
          {STAGES.map((s, i) => {
            const isActive = p.activeStage === s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={clsx("px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider transition-all duration-300 uppercase",
                    isActive ? "stage-glow" : "opacity-20")}
                  style={{
                    borderRadius: "4px",
                    color: isActive ? s.color : "#606680",
                    background: isActive ? `${s.color}20` : "transparent",
                    border: isActive ? `1px solid ${s.color}60` : "1px solid transparent",
                  }}
                >
                  {s.short}
                </div>
                {i < STAGES.length - 1 && (
                  <span className="text-[10px] px-0.5 opacity-5 font-bold">/</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTER: Tab Switcher */}
      <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/5 shadow-inner mx-2">
        {(["TRACK", "THINK", "VERIFY"] as AppTab[]).map(t => (
          <button
            key={t}
            onClick={() => p.onTabChange(t)}
            className={clsx(
              "px-4 py-1.5 rounded-md font-display text-[11px] font-bold tracking-widest transition-all",
              p.activeTab === t
                ? "bg-teal text-black shadow-lg shadow-teal/20"
                : "text-subtle hover:text-hi hover:bg-white/5"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* RIGHT: KPIs & Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-6 px-2">
          <div className="text-center group min-w-[50px]">
            <div className="font-display text-[18px] leading-none font-bold tabular-nums mb-1 transition-transform group-hover:scale-110 text-teal">
              ₹{(p.totalSaved / 1000).toFixed(1)}K
            </div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-subtle opacity-30">Saved</div>
          </div>

          <div className="text-center group min-w-[35px]">
            <div className="font-display text-[18px] leading-none font-bold tabular-nums mb-1 transition-transform group-hover:scale-110" style={{ color: divCol }}>
              {(p.divergence * 100).toFixed(0)}%
            </div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-subtle opacity-30">Div</div>
          </div>
        </div>

        <div className="h-8 w-px bg-border/20 mx-1" />

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button onClick={p.onToggleLlm}
            className={clsx(
              "px-3 py-1.5 font-mono text-[9px] font-bold border transition-all rounded-md",
              p.llmEnabled ? "border-purple/40 text-purple bg-purple/10" : "border-border/50 text-subtle opacity-40"
            )}
          >
            AI {p.llmEnabled ? "ON" : "OFF"}
          </button>

          <button onClick={p.onToggle}
            className={clsx(
              "px-4 py-1.5 font-display text-[11px] font-black tracking-tighter border transition-all rounded-md shadow-xl",
              p.agentRunning ? "bg-red/10 border-red/40 text-red" : "bg-green/10 border-green/40 text-green"
            )}
          >
            {p.agentRunning ? "TERMINATE" : "DEPLOY AGENT"}
          </button>

          <div className="font-mono text-[12px] font-bold tabular-nums ml-1 text-subtle opacity-40">
            {clock}
          </div>
        </div>
      </div>
    </nav>
  );
}
