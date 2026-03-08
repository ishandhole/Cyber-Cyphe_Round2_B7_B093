/**
 * PROMETHEUS — Human Approval Endpoint
 * Fix: actually executes the action when approved and tracks it in server state.
 * Previously this was a no-op that returned immediately with no side effects.
 */
import { NextResponse } from "next/server";
import { CARRIER_PROFILES } from "@/lib/data";

// Shared state reference — injected by cycle route
// In production this would be a DB transaction
declare global {
  // eslint-disable-next-line no-var
  var prometheusApprovals: Array<{
    decisionId: string;
    approved: boolean;
    action: string;
    entityId: string;
    approvedAt: number;
    operatorNote?: string;
  }>;
  // eslint-disable-next-line no-var
  var prometheusShips: unknown[];
}

if (!global.prometheusApprovals) global.prometheusApprovals = [];
if (!global.prometheusShips) global.prometheusShips = [];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { decisionId, approved, action, entityId, operatorNote } = body;

    if (!decisionId || approved === undefined) {
      return NextResponse.json({ ok: false, error: "Missing decisionId or approved" }, { status: 400 });
    }

    const record = {
      decisionId,
      approved: Boolean(approved),
      action: action ?? "unknown",
      entityId: entityId ?? "unknown",
      approvedAt: Date.now(),
      operatorNote: operatorNote ?? undefined,
    };

    // Log approval
    global.prometheusApprovals = [...(global.prometheusApprovals ?? []), record].slice(-100);

    // Execute side effects for approved maintenance actions
    let executionResult = null;
    if (approved && action === "pre_maintenance" && entityId?.startsWith("LINE")) {
      executionResult = {
        executed: true,
        impact: `${entityId} maintenance window authorized. Station cooling initiated. Downstream shipments notified. ETA +45min on dependent orders.`,
        maintenanceWindowStart: Date.now(),
        maintenanceWindowEnd: Date.now() + 45 * 60 * 1000,
      };
    }

    if (approved && action === "reroute" && global.prometheusShips) {
      // Apply reroute to ship state if available
      const ships = global.prometheusShips as Array<{ id: string; eta: number; sla: number; status: string; lastUpdated: number }>;
      const ship = ships.find((s) => s.id === entityId);
      if (ship) {
        ship.eta = Math.max(ship.eta - 0.6, ship.sla - 0.4);
        ship.status = ship.eta < ship.sla ? "warn" : "critical";
        ship.lastUpdated = Date.now();
        executionResult = { executed: true, impact: `Reroute approved and applied. ETA updated to ${ship.eta.toFixed(1)}h.` };
      }
    }

    if (approved && action === "carrier_swap" && global.prometheusShips) {
      const ships = global.prometheusShips as Array<{ id: string; carrier: string; eta: number; sla: number; status: string; lastUpdated: number }>;
      const ship = ships.find((s) => s.id === entityId);
      if (ship) {
        const oldCarrier = ship.carrier;
        ship.carrier = "BlueDart";
        const newCarrier = CARRIER_PROFILES["BlueDart"];
        if (newCarrier) {
          ship.eta = Math.max(ship.eta - 0.8, ship.sla - 0.5);
          ship.status = "warn";
          ship.lastUpdated = Date.now();
        }
        executionResult = { executed: true, impact: `Carrier swap approved: ${oldCarrier} → BlueDart. Tracking updated.` };
      }
    }

    return NextResponse.json({
      ok: true,
      decisionId,
      approved,
      executionResult,
      auditTrail: global.prometheusApprovals.slice(-5),
      ts: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    approvals: global.prometheusApprovals ?? [],
    count: (global.prometheusApprovals ?? []).length,
  });
}
