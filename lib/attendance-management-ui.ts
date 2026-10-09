import { format, parseISO } from "date-fns";
import type { ManagementAttendanceRecord } from "@/lib/api/attendance";
import { resolveAvatarSrc } from "@/lib/avatar";

export type ManagementAttendanceListItem = {
  /** Unique per list row (attendance record or user+date for absent rows). */
  id: string;
  userId: number;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  role: string;
  zone: string;
  status: string;
  subText: string;
  active: boolean;
  avatar: string;
  attendanceDate: string;
};

export function managementAttendanceRowId(record: ManagementAttendanceRecord): string {
  if (record.attendance_record_id != null) {
    return String(record.attendance_record_id);
  }

  return `user-${record.user_id}-${record.attendance_date}`;
}

export function mapManagementAttendanceRecord(
  record: ManagementAttendanceRecord,
): ManagementAttendanceListItem {
  const status = record.status;

  return {
    id: managementAttendanceRowId(record),
    userId: record.user_id,
    name: record.agent_name,
    address: record.zone ?? "—",
    zone: record.zone ?? "—",
    checkIn: record.clock_in_at
      ? format(parseISO(record.clock_in_at), "h:mma")
      : "No check in record",
    checkOut: record.clock_out_at
      ? format(parseISO(record.clock_out_at), "h:mma")
      : status !== "absent"
        ? "Still Active"
        : "No check out record",
    role: record.role ?? "Field Agent",
    status:
      status === "present" || status === "late" || status === "auto_clocked_out"
        ? "Present"
        : "Absent",
    subText: record.is_late
      ? "Late"
      : record.clock_out_at
        ? "Checked Out"
        : status !== "absent"
          ? "Active"
          : "Absent",
    active: !!record.clock_in_at && !record.clock_out_at,
    avatar: resolveAvatarSrc(record.avatar_url ?? record.avatar),
    attendanceDate: record.attendance_date,
  };
}
