export type ModerationReportRow = {
  id: string;
  reporter_id: string;
  target_type: "user" | "message" | "group" | "channel" | "community";
  target_id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  assigned_to: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type AdminProfileRow = {
  id: string;
  username: string | null;
  display_name: string;
  about: string;
  phone: string | null;
  status: "active" | "suspended" | "restricted";
  suspended_reason: string | null;
  created_at: string;
};

export type AuditRow = {
  id: number;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  result: string;
  created_at: string;
};

export type RoleRow = {
  user_id: string;
  role: string;
  created_at: string;
  profile?: { display_name: string; username: string | null } | null;
};
