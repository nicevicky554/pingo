export type Visibility =
  | "everyone"
  | "contacts"
  | "contacts_except"
  | "only"
  | "nobody";

export type MemberRole = "owner" | "admin" | "member";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string;
  about: string;
  avatar_path: string | null;
  public_avatar_url: string | null;
  phone?: string | null;
  created_at?: string;
  status?: "active" | "suspended" | "restricted";
  online_visibility?: Visibility;
  last_seen_visibility?: Visibility;
  reachable?: boolean;
  is_verified?: boolean;
};

export type UserSettings = {
  user_id: string;
  theme: "light" | "dark" | "system";
  accent: string;
  wallpaper: string;
  font_size: "sm" | "md" | "lg";
  message_preview: boolean;
  read_receipts: boolean;
  auto_download_media?: boolean;
  media_quality?: "standard" | "high";
  online_visibility: Visibility;
  last_seen_visibility: Visibility;
  avatar_visibility: Visibility;
  status_visibility: Visibility;
  who_can_add_to_groups: Visibility;
  notifications: {
    messages?: boolean;
    groups?: boolean;
    calls?: boolean;
    sound?: boolean;
  };
};

export type MessageKind = "text" | "image" | "video" | "file" | "voice" | "system";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: MessageKind;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  duration_seconds: number | null;
  waveform: number[] | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  expires_at: string | null;
  view_once?: boolean;
  /** Client-only optimistic state; never written to Postgres. */
  status?: "sending" | "failed";
  /** Client-only local object URL for an attachment still uploading. */
  local_url?: string;
};

export type ConversationSummary = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  last_message_at: string;
  announce_only: boolean;
  disappear_seconds: number | null;
  user_id: string;
  role: MemberRole;
  last_read_at: string;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  unread: number;
  last_message: {
    id: string;
    body: string;
    kind: MessageKind;
    created_at: string;
    sender_id: string;
    deleted_at: string | null;
  } | null;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
};

export type StatusUpdate = {
  id: string;
  user_id: string;
  kind: "text" | "image" | "video";
  body: string | null;
  media_path: string | null;
  background: string | null;
  caption: string | null;
  rotation?: number;
  created_at: string;
  expires_at: string;
  profile?: Profile | null;
};

export type Channel = {
  id: string;
  owner_id: string;
  username: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_public: boolean;
  created_at: string;
  is_verified?: boolean;
};

export type Community = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  owner_id: string;
  created_at: string;
};

export type CallRecord = {
  id: string;
  conversation_id: string | null;
  initiator_id: string;
  kind: "voice" | "video";
  status:
    | "ringing"
    | "accepted"
    | "declined"
    | "missed"
    | "cancelled"
    | "failed"
    | "ended";
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
};
