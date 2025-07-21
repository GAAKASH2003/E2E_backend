import { Request, Response } from "express";
import supabase from "../config/db";
import { groupByMonthIST, timeAgo } from "../utils/months";
export interface SuspiciousAlertMonthlyRow {
  month: string;
  count: number;
}
export interface SuspiciousAlertMonthlyResponse {
  data: SuspiciousAlertMonthlyRow[];
  change: number;
  trend: "increase" | "decrease" | "no change";
}

export async function fetchSuspiciousAlerts(orgId: string) {
  // We embed trucks and inner join on organisation_id
  const { data, error } = await supabase
    .from("truck_critical_alerts")
    .select("alert_time, alert_type, trucks!inner(truck_id, organisation_id)")
    .eq("alert_type", "suspicious_activity_detected")
    .eq("trucks.organisation_id", orgId);

  if (error) throw error;
  console.log(data);
  return data ?? [];
}

export function buildSuspiciousAlertsMonthly(
  rows: any[]
): SuspiciousAlertMonthlyResponse {
  const timestamps = rows.map((r) => r.alert_time).filter(Boolean);
  const grouped = groupByMonthIST(timestamps, true); // long month names

  // Convert to expected shape
  console.log(grouped);
  const data = grouped.map((g) => ({ month: g.monthLabel, count: g.count }));
  console.log(data);
  let change = 0;
  let trend: "increase" | "decrease" | "no change" = "no change";
  if (data.length > 1) {
    const last = data[data.length - 1].count;
    const prev = data[data.length - 2].count;
    change = last - prev;
    if (change > 0) trend = "increase";
    else if (change < 0) trend = "decrease";
  }

  return { data, change, trend };
}

export const CRITICAL_STATUS_MAP: Record<string, string> = {
  breakdown: "breakdown",
  delay: "delay",
  overdue: "overdue",
  low_mileage: "low_mileage",
  suspicious: "suspicious_activity_detected",
  suspicious_activity_detected: "suspicious_activity_detected",
};

/** Normalize user-provided status into enum value or null if not recognized. */
export function normalizeCriticalStatus(input?: string | null): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  return CRITICAL_STATUS_MAP[key] ?? null;
}

/** Pretty label for UI */
export function criticalStatusLabel(enumVal: string): string {
  switch (enumVal) {
    case "suspicious_activity_detected":
      return "Suspicious";
    case "breakdown":
      return "Breakdown";
    case "delay":
      return "Delay";
    case "overdue":
      return "Overdue";
    case "low_mileage":
      return "Low Mileage";
    default:
      return enumVal;
  }
}

export interface CriticalAlertRow {
  truck_no: string;
  critical_status: string; // pretty label
  time_elapsed: string; // e.g., "5m ago"
}

export interface CriticalAlertResponse {
  data: CriticalAlertRow[];
  count: number;
}

export async function getCriticalAlerts(
  orgId: string,
  status?: string
): Promise<CriticalAlertResponse> {
  // Normalize status to enum; if provided but invalid -> throw
  const enumVal = normalizeCriticalStatus(status ?? undefined);
  if (status && !enumVal) {
    throw new Error(`Unknown status: ${status}`);
  }

  let query = supabase
    .from("truck_critical_alerts")
    .select(
      "alert_id, alert_time, alert_type, resolved, trucks!inner(truck_number, organisation_id)"
    )
    .eq("resolved", false)
    .eq("trucks.organisation_id", orgId)
    .order("alert_time", { ascending: false });

  if (enumVal) {
    query = query.eq("alert_type", enumVal);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: CriticalAlertRow[] = (data ?? []).map((r: any) => ({
    truck_no: r.trucks?.truck_number ?? "Unknown",
    critical_status: criticalStatusLabel(r.alert_type),
    time_elapsed: timeAgo(r.alert_time),
  }));

  return { data: rows, count: rows.length };
}

export const suspiciousAlerts = async (req: Request, res: Response) => {
  console.log("suspiciousAlerts");
  const { orgId } = req.body;
  const { data, error } = await supabase
    .from("organisations")
    .select("*")
    .eq("organisation_id", orgId);
  if (!data) {
    return res
      .status(404)
      .json({ success: false, message: "Organisation not found" });
  }
  if (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching organisation" });
  }
  console.log(data);
  const rows = await fetchSuspiciousAlerts(orgId);
  const response = buildSuspiciousAlertsMonthly(rows);
  return res.status(200).json({ success: true, data: response });
};

export const criticalAlerts = async (req: Request, res: Response) => {
  const { orgId, status } = req.body;
  if (!orgId || !status) {
    return res.status(400).json({
      success: false,
      message: "Organisation ID and status are required",
    });
  }
  const enumVal = normalizeCriticalStatus(status ?? undefined);
  if (status && !enumVal) {
    throw new Error(`Unknown status: ${status}`);
  }

  let query = supabase
    .from("truck_critical_alerts")
    .select(
      "alert_id, alert_time, alert_type, resolved, trucks!inner(truck_number, organisation_id)"
    )
    .eq("resolved", false)
    .eq("trucks.organisation_id", orgId)
    .order("alert_time", { ascending: false });
  //   console.log(query);
  if (enumVal) {
    query = query.eq("alert_type", enumVal);
  }
  //   console.log(query);
  const { data, error } = await query;
  if (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching critical alerts" });
  }
  console.log(data);
  const rows: CriticalAlertRow[] = (data ?? []).map((r: any) => ({
    truck_no: r.trucks?.truck_number ?? "Unknown",
    critical_status: criticalStatusLabel(r.alert_type),
    time_elapsed: timeAgo(r.alert_time),
  }));

  const response = { data: rows, count: rows.length };
  return res.status(200).json({ success: true, data: response });
};
