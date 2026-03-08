import { NextResponse } from "next/server";
import { runCycle } from "@/lib/agent";
import { makeShipments, makeAssemblyLines, INITIAL_THRESHOLDS } from "@/lib/data";
import { Antibody, OutcomeRecord } from "@/lib/types";

// In-memory state for demo (would be DB in production)
let ships       = makeShipments();
let lines       = makeAssemblyLines();
let antibodies: Antibody[]      = [];
let thresholds  = { ...INITIAL_THRESHOLDS };
let outcomes:   OutcomeRecord[] = [];
let cycleCount  = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const raining: boolean = body.raining ?? false;

    // Drift ships slightly each cycle to simulate live data
    cycleCount++;
    ships = ships.map(s => ({
      ...s,
      eta:        Math.max(s.eta - 0.1 + Math.random() * 0.2, 10),
      shadowEta:  Math.max(s.shadowEta - 0.05 + Math.random() * 0.15, s.eta),
      lastUpdated:Date.now(),
    }));

    const result = runCycle(ships, lines, antibodies, thresholds, outcomes, raining);

    // Apply learning updates
    thresholds = result.loopStages.learn.update.updatedThresholds;
    antibodies = [
      ...antibodies,
      ...result.loopStages.learn.update.newAntibodies,
    ].slice(-50);
    for (const ua of result.loopStages.learn.update.updatedAntibodies) {
      const ab = antibodies.find(a => a.id === ua.id);
      if (ab) ab.efficacy = ua.newEfficacy;
    }
    outcomes = [...outcomes, ...result.loopStages.learn.update.newOutcomes].slice(-200);

    return NextResponse.json({ ok:true, result, antibodies, thresholds, cycleCount });
  } catch (e) {
    return NextResponse.json({ ok:false, error:String(e) }, { status:500 });
  }
}

export async function GET() {
  return NextResponse.json({ ships, lines, antibodies, thresholds, cycleCount });
}
