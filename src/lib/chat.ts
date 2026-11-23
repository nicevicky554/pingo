import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  supabase,
} from "@/lib/supabase";
import type {
  ConversationMember,
  ConversationSummary,
  Message,
  Profile,
} from "@/lib/types";

export async function listConversations(userId: string) {
  const { data, error } = await supabase
    .from("conversation_list")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

export async function listMembers(conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return { members: [] as (ConversationMember & { profile: Profile | null })[] };
  }
  const { data: memberRows, error } = await supabase
    .from("conversation_members")
    .select("conversation_id,user_id,role,joined_at")
    .in("conversation_id", conversationIds);
  if (error) throw error;

  const ids = Array.from(new Set((memberRows ?? []).map((row) => row.user_id)));
  const { data: profiles } = await supabase
    .from("public_profiles")
    .select("*")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((row) => [row.id, row as Profile]));

  return {
    members: (memberRows ?? []).map((row) => ({
      ...(row as ConversationMember),
      profile: byId.get(row.user_id) ?? null,
    })),
  };
}

export async function listMessages(conversationId: string, hiddenIds: string[] = []) {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (hiddenIds.length > 0) {
    query = query.not("id", "in", `(${hiddenIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse() as Message[];
}

export async function listHiddenMessageIds(userId: string, messageIds: string[]) {
  if (messageIds.length === 0) return [] as string[];
  const { data } = await supabase
    .from("message_deletions")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", messageIds);
  return (data ?? []).map((row) => row.message_id);
}

export async function listReceipts(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  const { data } = await supabase
    .from("message_receipts")
    .select("message_id,user_id,status")
    .in("message_id", messageIds);
  return data ?? [];
}

export async function listReactions(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  const { data } = await supabase
    .from("message_reactions")
    .select("message_id,user_id,emoji")
    .in("message_id", messageIds);
  return data ?? [];
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  kind?: Message["kind"];
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentMime?: string | null;
  durationSeconds?: number | null;
  waveform?: number[] | null;
  replyToId?: string | null;
  disappearSeconds?: number | null;
  viewOnce?: boolean;
}) {
  const expiresAt = input.disappearSeconds
    ? new Date(Date.now() + input.disappearSeconds * 1000).toISOString()
    : null;
  const payload: Record<string, unknown> = {
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
    kind: input.kind ?? "text",
    attachment_path: input.attachmentPath ?? null,
    attachment_name: input.attachmentName ?? null,
    attachment_size: input.attachmentSize ?? null,
    attachment_mime: input.attachmentMime ?? null,
    duration_seconds: input.durationSeconds ?? null,
    reply_to_id: input.replyToId ?? null,
    expires_at: expiresAt,
    view_once: input.viewOnce === true,
  };
  if (input.waveform && input.waveform.length > 0) {
    payload.waveform = input.waveform;
  }

  const insert = () =>
    supabase.from("messages").insert(payload).select("*").single<Message>();

  let { data, error } = await insert();
  // Older deployments may not have migration 0003 yet; text messages must
  // still send, and voice notes degrade to a plain audio attachment.
  if (error && /waveform/i.test(error.message)) {
    delete payload.waveform;
    ({ data, error } = await insert());
  }

  // If browser RLS rejects the insert, retry through the server endpoint. The
  // server independently verifies the token, membership and posting rights;
  // it never trusts senderId from this payload.
  if (error && (error.code === "42501" || /row-level security/i.test(error.message))) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const response = await fetch("/api/messages/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const result = (await response.json()) as { message?: Message };
          if (result.message) return result.message;
        } else if (response.status !== 404) {
          const detail = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(detail.error || "The server rejected the message.");
        }
      }
    } catch (fallbackError) {
      if (fallbackError instanceof Error && fallbackError.message) {
        throw new Error(`${error.message} · ${fallbackError.message}`);
      }
    }
  }

  if (error) throw error;
  if (!data) throw new Error("The message was not saved. Try again.");
  return data;
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
  messages: Message[],
  sendReceipts = true,
) {
  const now = new Date().toISOString();

  await supabase
    .from("conversation_members")
    .update({ last_read_at: now })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  // A device that has received the row can honestly acknowledge delivery even
  // when the reader has turned read receipts off.
  const delivered = messages
    .filter((message) => message.sender_id !== userId && !message.deleted_at)
    .map((message) => ({
      message_id: message.id,
      user_id: userId,
      status: "delivered" as const,
      updated_at: now,
    }));
  if (delivered.length > 0) {
    await supabase.from("message_receipts").upsert(delivered, {
      onConflict: "message_id,user_id",
      ignoreDuplicates: true,
    });
  }

  if (!sendReceipts) return;

  const receipts = messages
    .filter((message) => message.sender_id !== userId && !message.deleted_at)
    .map((message) => ({
      message_id: message.id,
      user_id: userId,
      status: "read" as const,
      updated_at: now,
    }));

  if (receipts.length > 0) {
    await supabase
      .from("message_receipts")
      .upsert(receipts, { onConflict: "message_id,user_id" });
  }
}

export async function uploadChatAttachment(
  conversationId: string,
  file: Blob,
  name: string,
  onProgress?: (percent: number) => void,
) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${conversationId}/${crypto.randomUUID()}-${safeName}`;

  // Preferred path: the server verifies membership with the secret-key client
  // and returns a one-off signed upload token. This avoids browser-side Storage
  // policy failures for voice notes and other private attachments.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      onProgress?.(1);
      const response = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          name,
          size: file.size,
          type: file.type,
        }),
      });
      if (response.ok) {
        const signed = (await response.json()) as { path: string; token: string };
        const { error } = await supabase.storage
          .from("media")
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type || undefined,
          });
        if (!error) {
          onProgress?.(100);
          return signed.path;
        }
        console.warn("[PINGO] signed upload failed, retrying direct upload", error.message);
      } else if (response.status !== 404) {
        const detail = await response.json().catch(() => ({}));
        console.warn("[PINGO] signed upload URL rejected", response.status, detail);
      }
    }
  } catch (err) {
    console.warn("[PINGO] signed upload unavailable", err);
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY && onProgress && file.size > 0) {
    const baseUrl = SUPABASE_URL;
    const apiKey = SUPABASE_ANON_KEY;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${baseUrl}/storage/v1/object/media/${path.split("/").map(encodeURIComponent).join("/")}`,
        );
        xhr.setRequestHeader("apikey", apiKey);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "false");
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(
              new Error(
                `Upload failed (${xhr.status}). ${xhr.responseText.slice(0, 160)}`,
              ),
            );
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
        xhr.send(file);
      });
      onProgress(100);
      return path;
    } catch (err) {
      // Fall back to the SDK upload if a proxy blocks the XHR endpoint.
      console.warn("[PINGO] direct upload failed, retrying via SDK", err);
    }
  }

  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { contentType: file.type || undefined, cacheControl: "3600" });
  if (error) throw error;
  onProgress?.(100);
  return path;
}

const mediaCache = new Map<string, { url: string; expires: number }>();

export async function signedMediaUrl(path: string) {
  const hit = mediaCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  mediaCache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + 50 * 60 * 1000,
  });
  return data.signedUrl;
}

export async function searchPeople(term: string, currentUserId: string) {
  const clean = term.trim().replace(/^@/, "");
  if (clean.length < 2) return [] as Profile[];
  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
    .neq("id", currentUserId)
    .limit(12);
  if (error) return [];
  return (data ?? []) as Profile[];
}

export async function searchMessages(term: string) {
  if (term.trim().length < 2) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,body,created_at,sender_id,kind")
    .ilike("body", `%${term.trim()}%`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return data ?? [];
}

export async function startDirectConversation(otherUserId: string) {
  const { data, error } = await supabase.rpc("start_direct_conversation", {
    other_user: otherUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function createGroup(
  title: string,
  memberIds: string[],
  description?: string,
) {
  const { data, error } = await supabase.rpc("create_group", {
    group_title: title,
    member_ids: memberIds,
    group_description: description ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function leaveGroup(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}
