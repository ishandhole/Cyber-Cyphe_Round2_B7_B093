// ═══════════════════════════════════════════════════════════
// PROMETHEUS — Shared Types
// ═══════════════════════════════════════════════════════════

export type RiskLevel   = "low" | "medium" | "high" | "critical";
export type ShipStatus  = "ok" | "warn" | "critical";
export type ShipStage   = "assembly" | "warehouse" | "transit" | "delivery";
export type ActionType  = "reroute" | "carrier_swap" | "pre_stage" | "pre_maintenance" | "reprioritize" | "escalate" | "monitor";
export type AutonomyTier = "autonomous" | "human_required" | "monitor_only";
export type LoopStage   = "OBSERVE" | "REASON" | "DECIDE" | "ACT" | "LEARN";

// ─── DATA LAYER ───────────────────────────────────────────
export interface Location {
  name: string; lat: number; lng: number;
  type: "warehouse" | "hub" | "assembly" | "delivery";
}

export interface JamZone {
  name: string; lat: number; lng: number;
  severity: "low" | "medium" | "high";
  delayMin: number;
}

export interface Shipment {
  id: string;
  from: string; to: string;
  stage: ShipStage; status: ShipStatus;
  carrier: string;
  eta: number;       // current best ETA in hours
  shadowEta: number; // shadow-world simulation ETA (+6h ahead)
  sla: number;       // SLA deadline in hours
  orderValue: number; // ₹
  inventoryType: string;
  lastUpdated: number;
}

export interface AssemblyLine {
  id: string; name: string;
  throughput: number;   // % of baseline
  temp: number;         // °C at critical station
  stations: Array<"ok" | "warn" | "critical">;
  pendingShipments: string[]; // shipment IDs downstream
}

export interface CarrierProfile {
  name: string;
  baseReliability: number;
  etaAccuracy: "high" | "medium" | "low";
  rainSensitivity: number;
  peakHourPenalty: number;
  weekendDrop: number;
  crossRegionBias: number;
  recentDrift: number; // measured over-promise ratio
  maxDailyLoad: number;   // max shipments carrier handles per day
  currentLoad: number;    // shipments already committed today
}

export interface SLAPenaltyTier {
  breachHours: number;  // breach by this many hours
  multiplier: number;   // penalty = orderValue * multiplier
  label: string;
}

// ─── AGENT LOOP ───────────────────────────────────────────

export interface Signal {
  id: string;
  source: "shipment" | "assembly" | "carrier" | "traffic" | "weather" | "inventory";
  entityId: string;
  type: string;
  value: number | string;
  severity: RiskLevel;
  timestamp: number;
  description: string;
}

export interface Hypothesis {
  id: string;
  entityId: string;
  entityType: "shipment" | "assembly_line" | "carrier";
  pattern: string;
  rootCause: string;
  confidence: number;        // 0–1
  evidence: string[];
  cascadeRisk: string[];     // downstream IDs affected
  breachProbability: number; // 0–1
  timeToImpact: number;      // hours
  antibodyMatch?: string;    // matched AB id if any
  llmRationale?: string;     // Claude's natural language reasoning (new)
  llmPowered?: boolean;      // whether LLM was used for this hypothesis (new)
}

export interface Decision {
  id: string;
  hypothesisId: string;
  entityId: string;
  action: ActionType;
  autonomy: AutonomyTier;
  confidence: number;
  rationale: string;
  costDelta: number;       // ₹ cost of taking this action
  penaltyAvoided: number;  // ₹ penalty avoided
  constraints: string[];
  alternatives: string[];
  humanApproved?: boolean;
  timestamp: number;
}

export interface ActionResult {
  id: string;
  decisionId: string;
  entityId: string;
  action: ActionType;
  executed: boolean;
  autonomy: AutonomyTier;
  outcome: "success" | "partial" | "failed" | "pending_approval" | "rejected";
  impact: string;
  googleMapsUrl?: string;
  timestamp: number;
}

export interface OutcomeRecord {
  id: string;
  decisionId: string;
  action: ActionType;
  entityId: string;
  predictedBreachProb: number;
  actualBreached: boolean;
  confidenceAtTime: number;
  efficacy: number;   // 0–1
  timestamp: number;
  learningNote: string;
}

export interface Antibody {
  id: string;
  label: string;
  antigenPattern: string;
  fingerprint: Record<string, string | number>;
  intervention: ActionType;
  efficacy: number;
  useCount: number;
  region: string;
  createdAt: number;
  lastUsed: number;
  crossoverParents?: [string, string]; // IDs if crossover-derived
}

// ─── LEARNING ─────────────────────────────────────────────

export interface LearningUpdate {
  updatedThresholds: Record<ActionType, number>;
  newAntibodies: Antibody[];
  updatedAntibodies: Array<{ id: string; newEfficacy: number }>;
  newOutcomes: OutcomeRecord[];
  notes: string[];
  divergenceDelta: number;
  thresholdChanges: Array<{ action: ActionType; from: number; to: number; reason: string }>;
}

// ─── AGENT CYCLE ──────────────────────────────────────────

export interface AgentCycleResult {
  cycleId: string;
  timestamp: number;
  loopStages: {
    observe:  { signals: Signal[];     durationMs: number };
    reason:   { hypotheses: Hypothesis[]; durationMs: number };
    decide:   { decisions: Decision[]; durationMs: number };
    act:      { results: ActionResult[]; durationMs: number };
    learn:    { update: LearningUpdate; durationMs: number };
  };
  divergenceScore: number;
  metrics: {
    signalCount: number;
    hypothesesFormed: number;
    decisionsAutonomous: number;
    decisionsEscalated: number;
    monitored: number;
    actionsExecuted: number;
    savingsEstimate: number;
  };
}

// ─── PENDING APPROVAL ─────────────────────────────────────
export interface PendingApproval {
  id: string;
  decision: Decision;
  hypothesis: Hypothesis;
  expiresAt: number;
  status: "pending" | "approved" | "rejected";
}

// ─── GLOBAL APP STATE ─────────────────────────────────────
export interface PrometheusAppState {
  ships: Shipment[];
  lines: AssemblyLine[];
  antibodies: Antibody[];
  confidenceThresholds: Record<ActionType, number>;
  outcomeHistory: OutcomeRecord[];
  pendingApprovals: PendingApproval[];
  cycles: AgentCycleResult[];
  divergenceScore: number;
  totalSaved: number;
  slaPreserved: number;
  breachCount: number;
  autonomousActions: number;
  escalations: number;
  currentLoop: LoopStage | null;
  agentRunning: boolean;
  raining: boolean;
  cycleCount: number;
}

// ─── AUDIT LOG ────────────────────────────────────────────
// Fix: was missing entirely — all decisions now create audit entries

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  cycleId: string;
  entityId: string;
  action: ActionType;
  autonomy: AutonomyTier;
  confidence: number;
  outcome: "success" | "partial" | "failed" | "pending_approval" | "rejected";
  rationale: string;
  costDelta: number;
  penaltyAvoided: number;
  operatorId?: string;        // set if human approved/rejected
  operatorNote?: string;
  llmPowered?: boolean;       // whether LLM reasoning was used
}

// ─── PENDING APPROVAL WITH EXPIRY ─────────────────────────
// Fix: expiry was mentioned in rationale strings but never enforced

export interface TrackedPendingApproval extends PendingApproval {
  expiresAt: number;       // timestamp — auto-escalate after 15min
  autoEscalateAfterMs: number; // default 900000 (15min)
  notifiedAt?: number;     // timestamp of first notification
  reminderSent?: boolean;
}
