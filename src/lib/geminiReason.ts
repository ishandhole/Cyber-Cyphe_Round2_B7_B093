/**
 * PROMETHEUS — Gemini-Powered Reasoning Stage
 * ─────────────────────────────────────────────
 * Replaces deterministic reason() with real LLM inference.
 * Gemini receives signals + context, returns structured hypotheses.
 * Falls back to deterministic reason() if API unavailable.
 */

import { Signal, Hypothesis, Shipment, AssemblyLine, Antibody } from "./types";

export interface GeminiReasonResult {
  hypotheses: Hypothesis[];
  llmUsed: boolean;
  rawNarrative?: string; // Gemini's natural language reasoning
}

const SYSTEM_PROMPT = `You are PROMETHEUS, an agentic AI reasoning engine for a logistics and supply chain platform in Mumbai, India.

You receive operational signals (anomalies, risks, drifts) from live shipment and assembly data. Your job is to:
1. Identify patterns across signals
2. Form hypotheses about what is likely to fail and why
3. Estimate breach probability using multi-factor reasoning
4. Identify cascade risks to other shipments
5. Explain your reasoning clearly

You operate under uncertainty. Be calibrated — don't over-claim confidence. Novel patterns get lower confidence than known ones.

Respond ONLY with a valid JSON array of hypothesis objects. No preamble, no markdown, no explanation outside JSON.

Each hypothesis must follow this exact schema:
{
  "entityId": string,
  "entityType": "shipment" | "assembly_line",
  "pattern": string (short label, e.g. "Carrier degradation + route jam compound"),
  "rootCause": string (2-3 sentences explaining what is happening and why),
  "confidence": number (0-1, your calibrated confidence),
  "breachProbability": number (0-1, probability of SLA breach or operational failure),
  "timeToImpact": number (hours until impact materializes),
  "evidence": string[] (list of specific evidence items from signals),
  "cascadeRisk": string[] (IDs of other entities at risk),
  "llmRationale": string (your natural language reasoning in 2-3 sentences, shown to operators)
}

Only include hypotheses where breachProbability > 0.25. Return [] if no significant risks found.`;

export async function geminiReason(
  signals: Signal[],
  ships: Shipment[],
  lines: AssemblyLine[],
  antibodies: Antibody[],
  raining: boolean,
  hour: number,
): Promise<GeminiReasonResult> {
  if (signals.length === 0) return { hypotheses: [], llmUsed: false };

  // Build context payload for Gemini
  const context = {
    signals: signals.map(s => ({
      id: s.id,
      type: s.type,
      entity: s.entityId,
      severity: s.severity,
      description: s.description,
      value: s.value,
    })),
    shipments: ships.map(s => ({
      id: s.id,
      carrier: s.carrier,
      stage: s.stage,
      status: s.status,
      etaHours: s.eta,
      shadowEtaHours: s.shadowEta,
      slaDeadlineHours: s.sla,
      etaDriftHours: +(s.shadowEta - s.eta).toFixed(2),
      orderValue: s.orderValue,
      inventoryType: s.inventoryType,
      route: `${s.from} → ${s.to}`,
    })),
    assemblyLines: lines.map(l => ({
      id: l.id,
      name: l.name,
      throughputPct: l.throughput,
      tempC: l.temp,
      stationStatuses: l.stations,
      pendingShipments: l.pendingShipments,
    })),
    environment: {
      raining,
      hour,
      knownAntibodies: antibodies.slice(0, 10).map(a => ({
        id: a.id,
        pattern: a.antigenPattern,
        efficacy: a.efficacy,
        intervention: a.intervention,
      })),
    },
  };

  try {
    const response = await fetch("/api/ai/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        systemPrompt: SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);

    const data = await response.json();
    const raw = data.content?.map((b: { type: string; text?: string }) => b.type === "text" ? b.text : "").join("") ?? "";

    // Strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed: Array<Record<string, unknown>> = JSON.parse(clean);

    // Stamp IDs and validate
    const ts = Date.now();
    const hypotheses: Hypothesis[] = parsed
      .filter(h => typeof h.entityId === "string" && typeof h.breachProbability === "number")
      .map((h, i) => ({
        id: `hyp-llm-${ts}-${i}`,
        entityId: h.entityId as string,
        entityType: (h.entityType as "shipment" | "assembly_line") ?? "shipment",
        pattern: (h.pattern as string) ?? "LLM-identified pattern",
        rootCause: (h.rootCause as string) ?? "",
        confidence: Math.min(0.97, Math.max(0.05, h.confidence as number ?? 0.5)),
        breachProbability: Math.min(0.97, Math.max(0.05, h.breachProbability as number ?? 0.3)),
        timeToImpact: (h.timeToImpact as number) ?? 2.0,
        evidence: (h.evidence as string[]) ?? [],
        cascadeRisk: (h.cascadeRisk as string[]) ?? [],
        antibodyMatch: undefined,
        llmRationale: (h.llmRationale as string) ?? undefined,
      }));

    return { hypotheses, llmUsed: true, rawNarrative: raw };

  } catch (err) {
    console.warn("[PROMETHEUS] Gemini API fallback:", err);
    return { hypotheses: [], llmUsed: false };
  }
}
