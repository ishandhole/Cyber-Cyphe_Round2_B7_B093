"use client";
/**
 * PROMETHEUS v6 — 5 gaps integrated cleanly
 * Layout: same 4-column structure, no new columns.
 *
 * Gap #1 (Multi-leg chains): Chain tab in left panel
 * Gap #2 (Warehouse congestion): wired into observe() → signals feed through naturally
 * Gap #5 (Trend engine): wired into observe() → signals feed through naturally
 * Gap #6 (Monte Carlo shadow): Shadow tab in left panel, runs each cycle
 * Gap #9 (Explain): replaces Scenarios as 4th left tab, persists in right col bottom
 *
 * UI principle: everything is revealed on-demand via tabs.
 * No new columns. Muted palette. Information density controlled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { makeShipments, makeAssemblyLines, INITIAL_THRESHOLDS, LOCATIONS } from "@/lib/data";
import { runCycle } from "@/lib/agent";
import { geminiReason } from "@/lib/geminiReason";
import { SCENARIOS } from "@/lib/scenarios";
import { makeShipmentChains, ShipmentChain } from "@/lib/multiLeg";
import { runAllMonteCarlo, MonteCarloResult } from "@/lib/monteCarlo";
import {
  Shipment, AssemblyLine, Antibody, OutcomeRecord,
  Signal, Hypothesis, Decision, ActionResult, LearningUpdate, LoopStage,
  AuditLogEntry,
} from "@/lib/types";
import { MetricsBar, AppTab } from "@/components/MetricsBar";
import { MapCanvas } from "@/components/MapCanvas";
import { ShipmentList } from "@/components/ShipmentList";
import { SignalPanel } from "@/components/SignalPanel";
import { HypothesisPanel } from "@/components/HypothesisPanel";
import { DecisionPanel } from "@/components/DecisionPanel";
import { LearningPanel } from "@/components/LearningPanel";
import { ExplainPanel } from "@/components/ExplainPanel";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { DeliveryTimeline } from "@/components/DeliveryTimeline";

type LeftTab = "ships" | "chain" | "shadow" | "assembly" | "policy";
type RightTab = "decide" | "explain" | "audit" | "learn";
type BottomView = "signals" | "timeline";

function loadState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const r = localStorage.getItem(`prometheus_${key}`); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
function saveState(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`prometheus_${key}`, JSON.stringify(val)); } catch { }
}

const APPROVAL_EXPIRY_MS = 15 * 60 * 1000;

export default function Page() {
  const shipsRef = useRef<Shipment[]>(makeShipments());
  const linesRef = useRef<AssemblyLine[]>(makeAssemblyLines());
  const antibodiesRef = useRef<Antibody[]>([]);
  const thresholdsRef = useRef<Record<string, number>>({ ...INITIAL_THRESHOLDS });
  const outcomesRef = useRef<OutcomeRecord[]>([]);
  const runningRef = useRef(false);
  const llmEnabledRef = useRef(true);

  const [ships, setShips] = useState<Shipment[]>(makeShipments);
  const [lines, setLines] = useState<AssemblyLine[]>(makeAssemblyLines);
  const [antibodies, setAntibodies] = useState<Antibody[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, number>>({ ...INITIAL_THRESHOLDS });
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [hyps, setHyps] = useState<Hypothesis[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [results, setResults] = useState<ActionResult[]>([]);
  const [learning, setLearning] = useState<LearningUpdate | null>(null);
  const [activeStage, setStage] = useState<LoopStage | null>(null);
  const [cycleMs, setCycleMs] = useState(0);
  const [agentRunning, setRunning] = useState(false);
  const [raining, setRaining] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("ships");
  const [rightTab, setRightTab] = useState<RightTab>("decide");
  const [bottomView, setBottomView] = useState<BottomView>("signals");
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  const [divergence, setDivergence] = useState(0.12);
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [lastInjected, setLastInjected] = useState<string | undefined>();
  const [chains] = useState<ShipmentChain[]>(makeShipmentChains);
  const [mcResults, setMcResults] = useState<Map<string, MonteCarloResult>>(new Map());
  const [activeTab, setActiveTab] = useState<AppTab>("TRACK");

  const [slaPreserved, setSla] = useState(0);
  const [breachCount, setBreach] = useState(0);
  const [autoActions, setAuto] = useState(0);
  const [escalations, setEscal] = useState(0);
  const [totalSaved, setSaved] = useState(0);
  const [cycleCount, setCycles] = useState(0);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  // Load state on mount to avoid hydration mismatch
  useEffect(() => {
    setSla(loadState("slaPreserved", 0));
    setBreach(loadState("breachCount", 0));
    setAuto(loadState("autoActions", 0));
    setEscal(loadState("escalations", 0));
    setSaved(loadState("totalSaved", 0));
    setCycles(loadState("cycleCount", 0));
    setAuditLog(loadState("auditLog", []));
  }, []);

  useEffect(() => { saveState("slaPreserved", slaPreserved); }, [slaPreserved]);
  useEffect(() => { saveState("breachCount", breachCount); }, [breachCount]);
  useEffect(() => { saveState("autoActions", autoActions); }, [autoActions]);
  useEffect(() => { saveState("escalations", escalations); }, [escalations]);
  useEffect(() => { saveState("totalSaved", totalSaved); }, [totalSaved]);
  useEffect(() => { saveState("cycleCount", cycleCount); }, [cycleCount]);
  useEffect(() => { saveState("auditLog", auditLog.slice(-200)); }, [auditLog]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setResults(prev => prev.map(r =>
        r.outcome === "pending_approval" && (now - r.timestamp) > APPROVAL_EXPIRY_MS
          ? { ...r, outcome: "failed" as const, impact: "Auto-escalated: no operator response within 15min." }
          : r
      ));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const appendAudit = useCallback((decs: Decision[], res: ActionResult[], cycleId: string, usedLlm: boolean) => {
    const entries: AuditLogEntry[] = decs.map(dec => {
      const r = res.find(x => x.decisionId === dec.id);
      return {
        id: `audit-${dec.id}`, timestamp: dec.timestamp, cycleId,
        entityId: dec.entityId, action: dec.action, autonomy: dec.autonomy,
        confidence: dec.confidence, outcome: r?.outcome ?? "failed",
        rationale: dec.rationale, costDelta: dec.costDelta,
        penaltyAvoided: dec.penaltyAvoided, llmPowered: usedLlm,
      };
    });
    setAuditLog(prev => [...prev, ...entries].slice(-200));
  }, []);

  const runAgentCycle = useCallback(async () => {
    if (!runningRef.current) return;
    const t0 = Date.now();

    shipsRef.current = shipsRef.current.map(s => ({
      ...s,
      eta: Math.max(s.eta - 0.08 + Math.random() * 0.18, 10),
      shadowEta: Math.max(s.shadowEta - 0.04 + Math.random() * 0.12, s.eta),
      lastUpdated: Date.now(),
    }));

    setStage("OBSERVE"); await wait(380);
    const baseResult = runCycle(
      shipsRef.current, linesRef.current,
      antibodiesRef.current, thresholdsRef.current,
      outcomesRef.current, raining
    );
    setSignals([...baseResult.loopStages.observe.signals]);

    // Gap #6: Run Monte Carlo each cycle
    const hour = new Date().getHours();
    const mc = runAllMonteCarlo(shipsRef.current, hour, raining, LOCATIONS);
    setMcResults(mc);

    setStage("REASON"); await wait(360);
    let finalHyps = [...baseResult.loopStages.reason.hypotheses];
    let usedLlm = false;
    if (llmEnabledRef.current && baseResult.loopStages.observe.signals.length > 0) {
      try {
        const llmResult = await geminiReason(
          baseResult.loopStages.observe.signals,
          shipsRef.current, linesRef.current,
          antibodiesRef.current, raining, hour,
        );
        if (llmResult.llmUsed && llmResult.hypotheses.length > 0) {
          const llmIds = new Set(llmResult.hypotheses.map((h: Hypothesis) => h.entityId));
          finalHyps = [
            ...llmResult.hypotheses.map((h: Hypothesis) => ({ ...h, llmPowered: true })),
            ...finalHyps.filter((h: Hypothesis) => !llmIds.has(h.entityId)),
          ];
          usedLlm = true;
        }
      } catch { /* fallback to deterministic */ }
    }
    setHyps(finalHyps);

    setStage("DECIDE"); await wait(340);
    const { decide } = await import("@/lib/agent");
    const finalDecisions = decide(finalHyps, shipsRef.current, thresholdsRef.current);
    setDecisions([...finalDecisions]);

    setStage("ACT"); await wait(340);
    const { act } = await import("@/lib/agent");
    const finalResults = act(finalDecisions, shipsRef.current);
    setResults([...finalResults]);
    setShips([...shipsRef.current]);
    setLines([...linesRef.current]);

    const newBreaches = shipsRef.current.filter(s => s.eta > s.sla && s.status === "critical").length;
    setBreach(b => b + newBreaches);

    setStage("LEARN"); await wait(340);
    const upd = baseResult.loopStages.learn.update;
    thresholdsRef.current = upd.updatedThresholds;
    antibodiesRef.current = [...antibodiesRef.current, ...upd.newAntibodies].slice(-60);
    for (const ua of upd.updatedAntibodies) {
      const ab = antibodiesRef.current.find(a => a.id === ua.id);
      if (ab) ab.efficacy = ua.newEfficacy;
    }
    outcomesRef.current = [...outcomesRef.current, ...upd.newOutcomes].slice(-300);
    setAntibodies([...antibodiesRef.current]);
    setThresholds({ ...thresholdsRef.current });
    setOutcomes([...outcomesRef.current]);
    setLearning(upd);
    appendAudit(finalDecisions, finalResults, baseResult.cycleId, usedLlm);

    setAuto(a => a + baseResult.metrics.decisionsAutonomous);
    setEscal(e => e + baseResult.metrics.decisionsEscalated);
    setSaved(s => s + Math.max(0, baseResult.metrics.savingsEstimate));
    setSla(s => s + baseResult.metrics.actionsExecuted);
    setDivergence(baseResult.divergenceScore);
    setCycles(c => c + 1);
    setCycleMs(Date.now() - t0);
    setStage(null);

    if (runningRef.current) setTimeout(runAgentCycle, 5000);
  }, [raining, appendAudit]);

  const toggleAgent = () => {
    if (agentRunning) { runningRef.current = false; setRunning(false); setStage(null); }
    else { runningRef.current = true; setRunning(true); runAgentCycle(); }
  };

  const handleApprove = useCallback((decisionId: string, approved: boolean) => {
    const dec = decisions.find(d => d.id === decisionId);
    const actualSaving = dec?.penaltyAvoided ?? 8000;
    setResults(prev => prev.map(r =>
      r.decisionId === decisionId
        ? {
          ...r, outcome: approved ? "success" as const : "rejected" as const,
          impact: approved ? "Approved by operator — executing now" : "Rejected by operator"
        }
        : r
    ));
    if (approved) { setAuto(a => a + 1); setSla(s => s + 1); setSaved(t => t + actualSaving); }
    else setEscal(e => e + 1);
    fetch("/api/agent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId, approved, action: dec?.action, entityId: dec?.entityId }),
    }).catch(console.warn);
  }, [decisions]);

  const handlePreventLine = useCallback(() => {
    const now = Date.now();
    const dec: Decision = {
      id: `dec-manual-${now}`, hypothesisId: "hyp-manual", entityId: "LINE-3",
      action: "pre_maintenance", autonomy: "human_required", confidence: 0.81,
      rationale: "LINE-3: Paint station 87.4°C, throughput 61%. Shadow predicts shutdown T+2.5h. Pre-emptive 30min maintenance (₹2.2K) prevents cascade of 3 SLA breaches (₹47K). Human approval required per autonomy policy.",
      costDelta: 2200, penaltyAvoided: 47000,
      constraints: ["Authorized ops personnel required", "Max 45min maintenance window", "Clear downstream before restart"],
      alternatives: ["Reroute downstream to LINE-2", "Accept throughput drop and monitor"],
      timestamp: now,
    };
    const res: ActionResult = {
      id: `act-manual-${now}`, decisionId: dec.id, entityId: "LINE-3",
      action: "pre_maintenance", executed: false, autonomy: "human_required",
      outcome: "pending_approval", impact: "Queued for operator review — shadow cascade replay attached.",
      timestamp: now,
    };
    setDecisions(prev => [dec, ...prev.slice(0, 9)]);
    setResults(prev => [res, ...prev.slice(0, 9)]);
    setEscal(e => e + 1);
    appendAudit([dec], [res], "manual", false);
  }, [appendAudit]);

  const handleScenarioInject = useCallback((scenarioId: string) => {
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) return;
    const { ships: ns, lines: nl } = scenario.apply(shipsRef.current, linesRef.current);
    shipsRef.current = ns; linesRef.current = nl;
    setShips([...ns]); setLines([...nl]);
    setLastInjected(scenarioId);
    if (!runningRef.current) { runningRef.current = true; setRunning(true); runAgentCycle(); }
  }, [runAgentCycle]);

  const toggleLlm = () => { llmEnabledRef.current = !llmEnabled; setLlmEnabled(v => !v); };

  return (
    <div className="h-screen bg-[#0a0c12] text-[#a0a8c0] font-body selection:bg-teal/30 overflow-hidden relative">
      <MetricsBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        slaPreserved={slaPreserved} breachCount={breachCount} autoActions={autoActions} escalations={escalations}
        totalSaved={totalSaved} divergence={divergence} cycleCount={cycleCount}
        agentRunning={agentRunning} activeStage={activeStage} cycleMs={cycleMs}
        raining={raining}
        onToggle={toggleAgent}
        onRain={() => setRaining(r => !r)}
        llmEnabled={llmEnabled}
        onToggleLlm={toggleLlm}
      />

      <main className="h-full w-full">
        {/* SECTION 1: TRACK (Operations) */}
        {activeTab === "TRACK" && (
          <div className="tab-container max-w-[1800px] mx-auto space-y-16 tab-enter pt-32 pb-20 px-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-4xl font-bold text-hi tracking-tight">Operational Control</h2>
              <div className="font-mono text-sm text-subtle tracking-widest opacity-40 uppercase">Sector 01 // Track</div>
            </div>

            <div className="grid grid-cols-[480px,1fr] gap-12 h-[920px]">
              <aside className="premium-card flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-8 flex-shrink-0">
                  <h3 className="section-label !text-lg">Live Shipments</h3>
                  <span className="font-mono text-xs opacity-40">{ships.filter(s => s.stage === 'transit').length} ACTIVE</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  <ShipmentList
                    ships={ships} lines={lines}
                    tab={leftTab}
                    onTab={t => setLeftTab(t as LeftTab)}
                    onPreventLine={handlePreventLine}
                    chains={chains}
                    monteCarloResults={mcResults}
                  />
                </div>
              </aside>

              <div className="flex flex-col gap-8 h-full">
                <div className="grid grid-cols-2 gap-8 flex-1">
                  <div className="premium-card !p-0 overflow-hidden relative group">
                    <div className="absolute top-6 left-6 z-10 font-mono text-xs px-3 py-1.5 bg-black/70 rounded-md border border-white/10">REAL_TIME_FEED</div>
                    <MapCanvas ships={ships} isShadow={false} />
                  </div>
                  <div className="premium-card !p-0 overflow-hidden relative group border-purple/20">
                    <div className="absolute top-6 left-6 z-10 font-mono text-xs px-3 py-1.5 bg-black/70 rounded-md border border-purple/30 text-purple">SHADOW_PREDICT</div>
                    <MapCanvas ships={ships} isShadow={true} />
                  </div>
                </div>

                <div className="h-[420px] premium-card flex flex-col">
                  <div className="flex items-center gap-10 mb-8 border-b border-white/5 pb-4 flex-shrink-0">
                    <button
                      onClick={() => setBottomView("signals")}
                      className={clsx("section-label transition-colors text-xl", bottomView === "signals" ? "!text-teal" : "hover:text-hi")}
                    >
                      Signal Stream
                    </button>
                    <button
                      onClick={() => setBottomView("timeline")}
                      className={clsx("section-label transition-colors text-xl", bottomView === "timeline" ? "!text-teal" : "hover:text-hi")}
                    >
                      Delivery Timeline
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {bottomView === "signals" ? (
                      <div className="h-full overflow-y-auto pr-4 custom-scrollbar">
                        <SignalPanel signals={signals} />
                      </div>
                    ) : (
                      <div className="h-full overflow-hidden">
                        <DeliveryTimeline
                          chains={chains} ships={ships} mcResults={mcResults}
                          selectedShipment={selectedShip} onSelectShipment={setSelectedShip}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Added extra space for scroll feel */}
            <div className="h-20" />
          </div>
        )}

        {/* SECTION 2: THINK (AI Intelligence focus) */}
        {activeTab === "THINK" && (
          <div className="tab-container max-w-[1600px] mx-auto space-y-16 tab-enter pt-32 pb-20 px-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-4xl font-bold text-hi tracking-tight">Cognitive Engine</h2>
              <div className="font-mono text-sm text-subtle tracking-widest opacity-40 uppercase">Sector 02 // Think</div>
            </div>

            <div className="grid grid-cols-3 gap-12 h-[840px]">
              {/* Pillar 1: Conversational Intelligence */}
              <section className="flex flex-col premium-card h-full overflow-hidden border-purple/20">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="section-label !text-lg">Gemini Intelligence</h3>
                  <div className="px-4 py-1.5 bg-purple/10 border border-purple/30 rounded-full text-purple font-mono text-[9px] font-bold uppercase tracking-widest">Logic Bridge</div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ExplainPanel ships={ships} signals={signals} hypotheses={hyps}
                    decisions={decisions} antibodies={antibodies} raining={raining} cycleCount={cycleCount} />
                </div>
              </section>

              {/* Pillar 2: Autonomous Reasoning */}
              <section className="flex flex-col premium-card h-full overflow-hidden">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="section-label !text-lg">Reasoning Narrative</h3>
                  <div className="px-4 py-1.5 bg-cyan/10 border border-cyan/30 rounded-full text-cyan font-mono text-[9px] font-bold uppercase tracking-widest">Pattern Match</div>
                </div>
                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  <HypothesisPanel hypotheses={hyps} />
                </div>
              </section>

              {/* Pillar 3: Intervention Queue */}
              <section className="flex flex-col premium-card h-full overflow-hidden">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="section-label !text-lg">Intervention Queue</h3>
                  <div className="px-4 py-1.5 bg-orange/10 border border-orange/30 rounded-full text-orange font-mono text-[9px] font-bold uppercase tracking-widest">Action Desk</div>
                </div>
                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  <DecisionPanel
                    decisions={decisions}
                    results={results} onApprove={handleApprove}
                  />
                </div>
              </section>
            </div>

            <div className="h-20" />
          </div>
        )}

        {/* SECTION 3: VERIFY (Audit & Performance focus) */}
        {activeTab === "VERIFY" && (
          <div className="tab-container max-w-[1600px] mx-auto space-y-16 tab-enter pt-32 pb-20 px-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-4xl font-bold text-hi tracking-tight">Verification & Audit</h2>
              <div className="font-mono text-sm text-subtle tracking-widest opacity-40 uppercase">Sector 03 // Verify</div>
            </div>

            <div className="grid grid-cols-2 gap-12 h-[920px]">
              <div className="flex flex-col gap-12">
                <div className="flex-1 premium-card flex flex-col overflow-hidden">
                  <h3 className="section-label !text-lg mb-8">Autonomous Audit Trail</h3>
                  <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                    <AuditLogPanel entries={auditLog} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-8 h-full">
                <div className="flex-1 premium-card flex flex-col overflow-hidden border-teal/20">
                  <h3 className="section-label !text-lg mb-8 text-teal">Self-Learning State</h3>
                  <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                    <LearningPanel learning={learning} antibodies={antibodies}
                      outcomes={outcomes} thresholds={thresholds} divergence={divergence} />
                  </div>
                </div>
                <div className="h-[340px] premium-card flex flex-col justify-center items-center text-center">
                  <div className="text-6xl font-display font-black text-hi mb-6">99.2%</div>
                  <div className="font-mono text-sm opacity-40 tracking-widest uppercase">Reliability Index</div>
                  <div className="w-64 h-2 bg-white/5 rounded-full mt-8 relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-teal w-[99.2%]" />
                  </div>
                </div>
              </div>
            </div>

            <footer className="py-20 text-center border-t border-white/5 bg-black/20">
              <div className="font-mono text-xs opacity-20 tracking-[0.4em] uppercase">
                Prometheus v1.2 // Autonomous Logistics Guard
              </div>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
