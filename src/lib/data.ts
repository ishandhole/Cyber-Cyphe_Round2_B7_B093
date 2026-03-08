import { Location, JamZone, Shipment, AssemblyLine, CarrierProfile } from "./types";

export const MAP_BOUNDS = { minLat:18.87, maxLat:19.32, minLng:72.77, maxLng:73.12 };

export function ll2xy(lat:number, lng:number, W:number, H:number):[number,number] {
  const x = (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * W;
  const y = H - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * H;
  return [x, y];
}

export const LOCATIONS: Record<string, Location> = {
  wh_dharavi:    { name:"Dharavi WH",       lat:19.0436,lng:72.8538, type:"warehouse" },
  wh_andheri:    { name:"Andheri Hub",      lat:19.1136,lng:72.8697, type:"warehouse" },
  wh_thane:      { name:"Thane Dist.",      lat:19.2183,lng:72.9781, type:"warehouse" },
  hub_kurla:     { name:"Kurla Depot",      lat:19.0728,lng:72.8826, type:"hub" },
  hub_bandra:    { name:"Bandra Hub",       lat:19.0544,lng:72.8402, type:"hub" },
  hub_navi:      { name:"Navi Mumbai",      lat:19.0330,lng:73.0297, type:"hub" },
  asm_powai:     { name:"Powai Assembly",   lat:19.1176,lng:72.9060, type:"assembly" },
  asm_chembur:   { name:"Chembur Plant",    lat:19.0522,lng:72.9005, type:"assembly" },
  del_colaba:    { name:"Colaba",           lat:18.9067,lng:72.8147, type:"delivery" },
  del_worli:     { name:"Worli",            lat:19.0176,lng:72.8181, type:"delivery" },
  del_malad:     { name:"Malad",            lat:19.1874,lng:72.8484, type:"delivery" },
  del_borivali:  { name:"Borivali",         lat:19.2307,lng:72.8567, type:"delivery" },
  del_vashi:     { name:"Vashi",            lat:19.0771,lng:73.0097, type:"delivery" },
  del_mulund:    { name:"Mulund",           lat:19.1726,lng:72.9576, type:"delivery" },
  del_juhu:      { name:"Juhu",             lat:19.1075,lng:72.8263, type:"delivery" },
};

export const JAM_ZONES: JamZone[] = [
  { name:"Mahim Causeway",   lat:19.0590,lng:72.8355, severity:"high",   delayMin:45 },
  { name:"WEH Andheri Toll", lat:19.1020,lng:72.8650, severity:"medium", delayMin:30 },
  { name:"Kurla Junction",   lat:19.0728,lng:72.8826, severity:"high",   delayMin:40 },
  { name:"Thane Creek",      lat:19.1700,lng:72.9500, severity:"medium", delayMin:25 },
  { name:"Sion Circle",      lat:19.0300,lng:72.8650, severity:"low",    delayMin:15 },
];

export const CARRIER_PROFILES: Record<string, CarrierProfile> = {
  BlueDart:  { name:"BlueDart",  baseReliability:0.92, etaAccuracy:"high",   rainSensitivity:0.05, peakHourPenalty:0.08, weekendDrop:0.04, crossRegionBias:0.02, recentDrift:0.03, maxDailyLoad:12, currentLoad:7  },
  Delhivery: { name:"Delhivery", baseReliability:0.78, etaAccuracy:"medium", rainSensitivity:0.10, peakHourPenalty:0.12, weekendDrop:0.10, crossRegionBias:0.15, recentDrift:0.11, maxDailyLoad:18, currentLoad:14 },
  DTDC:      { name:"DTDC",      baseReliability:0.82, etaAccuracy:"medium", rainSensitivity:0.07, peakHourPenalty:0.06, weekendDrop:0.05, crossRegionBias:0.05, recentDrift:0.06, maxDailyLoad:15, currentLoad:6  },
  Ekart:     { name:"Ekart",     baseReliability:0.69, etaAccuracy:"low",    rainSensitivity:0.13, peakHourPenalty:0.09, weekendDrop:0.08, crossRegionBias:0.10, recentDrift:0.09, maxDailyLoad:10, currentLoad:9  },
  Shadowfax: { name:"Shadowfax", baseReliability:0.57, etaAccuracy:"low",    rainSensitivity:0.19, peakHourPenalty:0.05, weekendDrop:0.12, crossRegionBias:0.22, recentDrift:0.18, maxDailyLoad:8,  currentLoad:7  },
};

// SLA penalty tiers — graduated by depth of breach
export const SLA_PENALTY_TIERS = [
  { breachHours: 1,   multiplier: 0.10, label: "Minor (<1h)"     },
  { breachHours: 4,   multiplier: 0.20, label: "Moderate (1–4h)" },
  { breachHours: 999, multiplier: 0.40, label: "Severe (>4h)"    },
];

export function calcSLAPenalty(orderValue: number, etaHours: number, slaHours: number): number {
  const breach = etaHours - slaHours;
  if (breach <= 0) return 0;
  const tier = SLA_PENALTY_TIERS.find(t => breach <= t.breachHours) ?? SLA_PENALTY_TIERS[SLA_PENALTY_TIERS.length - 1];
  return orderValue * tier.multiplier;
}

// Returns true if carrier has capacity for one more shipment
export function carrierHasCapacity(carrierId: string): boolean {
  const p = CARRIER_PROFILES[carrierId];
  return p ? p.currentLoad < p.maxDailyLoad : true;
}

// Commits one shipment to carrier load (called when reroute/swap action executes)
export function commitCarrierLoad(carrierId: string): void {
  const p = CARRIER_PROFILES[carrierId];
  if (p) p.currentLoad = Math.min(p.maxDailyLoad, p.currentLoad + 1);
}

// Returns capacity utilisation 0-1
export function carrierCapacityUtil(carrierId: string): number {
  const p = CARRIER_PROFILES[carrierId];
  return p ? p.currentLoad / p.maxDailyLoad : 0;
}

export function calcReliability(carrier:string, hour:number, raining:boolean):number {
  const p = CARRIER_PROFILES[carrier];
  if (!p) return 0.65;
  let r = p.baseReliability;
  if (raining) r *= (1 - p.rainSensitivity);
  if (hour >= 14 && hour <= 19) r *= (1 - p.peakHourPenalty);
  r *= (1 - p.crossRegionBias * 0.3);
  return Math.max(0.1, Math.min(1.0, r));
}

export function makeShipments(): Shipment[] {
  return [
    { id:"SHP-001", from:"wh_dharavi",  to:"del_colaba",   stage:"transit",   status:"warn",     carrier:"BlueDart",  eta:18.0, shadowEta:22.5, sla:19, orderValue:45000,  inventoryType:"Electronics",  lastUpdated:Date.now() },
    { id:"SHP-002", from:"asm_powai",   to:"del_malad",    stage:"assembly",  status:"critical", carrier:"Delhivery", eta:20.0, shadowEta:28.5, sla:19, orderValue:82000,  inventoryType:"Auto Parts",   lastUpdated:Date.now() },
    { id:"SHP-003", from:"wh_andheri",  to:"del_worli",    stage:"delivery",  status:"ok",       carrier:"DTDC",      eta:16.0, shadowEta:17.0, sla:18, orderValue:31000,  inventoryType:"FMCG",         lastUpdated:Date.now() },
    { id:"SHP-004", from:"hub_kurla",   to:"del_vashi",    stage:"transit",   status:"warn",     carrier:"Ekart",     eta:21.0, shadowEta:25.0, sla:20, orderValue:67000,  inventoryType:"Pharma",       lastUpdated:Date.now() },
    { id:"SHP-005", from:"wh_thane",    to:"del_mulund",   stage:"warehouse", status:"critical", carrier:"Shadowfax", eta:23.0, shadowEta:31.0, sla:21, orderValue:93000,  inventoryType:"Perishables",  lastUpdated:Date.now() },
    { id:"SHP-006", from:"asm_chembur", to:"del_juhu",     stage:"assembly",  status:"ok",       carrier:"BlueDart",  eta:17.0, shadowEta:18.0, sla:19, orderValue:28000,  inventoryType:"Textiles",     lastUpdated:Date.now() },
    { id:"SHP-007", from:"hub_bandra",  to:"del_borivali", stage:"transit",   status:"warn",     carrier:"Delhivery", eta:22.0, shadowEta:27.0, sla:21, orderValue:54000,  inventoryType:"Electronics",  lastUpdated:Date.now() },
    { id:"SHP-008", from:"hub_navi",    to:"del_colaba",   stage:"transit",   status:"ok",       carrier:"DTDC",      eta:19.0, shadowEta:20.0, sla:21, orderValue:39000,  inventoryType:"FMCG",         lastUpdated:Date.now() },
  ];
}

export function makeAssemblyLines(): AssemblyLine[] {
  return [
    { id:"LINE-1", name:"L1 Assembly", throughput:94, temp:68.2, stations:["ok","ok","ok","ok","ok"],             pendingShipments:["SHP-006"] },
    { id:"LINE-3", name:"L3 Assembly", throughput:61, temp:87.4, stations:["ok","warn","critical","warn","ok"],   pendingShipments:["SHP-002","SHP-004"] },
    { id:"LINE-2", name:"L2 Assembly", throughput:82, temp:72.1, stations:["ok","ok","warn","ok","ok"],           pendingShipments:[] },
  ];
}

export const STATION_NAMES = ["FEED","WELD","PAINT","PACK","QC"];

export const INITIAL_THRESHOLDS: Record<string, number> = {
  reroute:         0.75,
  carrier_swap:    0.80,
  pre_stage:       0.70,
  pre_maintenance: 0.65, // always human anyway
  reprioritize:    0.72,
  escalate:        0.45,
  monitor:         0.00,
};

export const AUTONOMY_MATRIX = [
  { action:"reroute",         tier:"autonomous",     condition:"Confidence ≥75% · order ≤₹1L · in transit/delivery",    example:"Reroute SHP-001 around Mahim jam" },
  { action:"carrier_swap",    tier:"autonomous",     condition:"Confidence ≥80% · pre-approved alternate exists",        example:"Swap Shadowfax → BlueDart (pre-auth)" },
  { action:"pre_stage",       tier:"autonomous",     condition:"Confidence ≥70% · buffer stock available",               example:"Pre-stage at Andheri hub before chaos cascade" },
  { action:"reprioritize",    tier:"autonomous",     condition:"Confidence ≥72% · same carrier same route",              example:"Elevate SHP-004 (Pharma) above SHP-007" },
  { action:"pre_maintenance", tier:"human_required", condition:"Always — ops personnel sign-off required",               example:"Authorize LINE-3 30min maintenance window" },
  { action:"escalate",        tier:"human_required", condition:"Confidence <75% · order >₹1L · ambiguous tradeoff",      example:"SHP-005: Shadowfax+WH, cost unclear" },
  { action:"monitor",         tier:"monitor_only",   condition:"Breach probability <30% · no action warranted",          example:"SHP-003: low risk, observe" },
];
