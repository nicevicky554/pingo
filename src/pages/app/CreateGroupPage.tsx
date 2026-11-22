import { PageHeader } from "@/components/app/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { createGroup, searchPeople } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

const STEPS = ["Members", "Details", "Permissions", "Review"];

export default function CreateGroupPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [term, setTerm] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [announceOnly, setAnnounceOnly] = useState(false);
  const [membersCanAdd, setMembersCanAdd] = useState(true);
  const [approveMembers, setApproveMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: rows } = await supabase
        .from("contacts")
        .select("contact_id")
        .eq("owner_id", profile.id);
      const ids = (rows ?? []).map((row) => row.contact_id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", ids);
      setContacts((data ?? []) as Profile[]);
    })();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const timeout = window.setTimeout(async () => {
      if (term.trim().length < 2) {
        setPeople([]);
        return;
      }
      setPeople(await searchPeople(term, profile.id));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [profile, term]);

  function toggle(person: Profile) {
    setSelected((current) =>
      current.some((item) => item.id === person.id)
        ? current.filter((item) => item.id !== person.id)
        : [...current, person],
    );
  }

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setError("Choose an image under 8 MB.");
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  }

  async function create() {
    if (!profile || selected.length === 0 || title.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      let avatarUrl: string | null = null;
      if (photo) {
        const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.id}/groups/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const conversationId = await createGroup(
        title.trim(),
        selected.map((person) => person.id),
        description.trim() || undefined,
      );

      const { error: settingsError } = await supabase
        .from("conversations")
        .update({
          avatar_url: avatarUrl,
          announce_only: announceOnly,
          member_permissions: {
            send_messages: true,
            edit_info: false,
            add_members: membersCanAdd,
            approve_members: approveMembers,
            manage_messages: false,
          },
        })
        .eq("id", conversationId);
      if (settingsError) throw settingsError;

      navigate(`/app/chats?c=${conversationId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The group could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const list = term.trim().length >= 2 ? people : contacts;

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader
        title="New group"
        subtitle={`${selected.length} selected · step ${step + 1} of ${STEPS.length}`}
        back={() => (step > 0 ? setStep(step - 1) : navigate("/app/chats"))}
      />

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5">
        <div className="flex gap-1.5">
          {STEPS.map((label, index) => (
            <div key={label} className="flex-1">
              <div
                className={cn(
                  "h-[3px] rounded-full",
                  index <= step ? "bg-primary" : "bg-border",
                )}
              />
              <p
                className={cn(
                  "mt-1.5 hidden text-[0.6rem] sm:block",
                  index === step ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </p>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search people"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selected.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggle(person)}
                    className="flex items-center gap-1.5 rounded-full bg-accent py-1 pr-2 pl-1 text-xs font-medium text-primary"
                  >
                    <UserAvatar profile={person} size="xs" />
                    {person.display_name.split(" ")[0]}
                    <X className="size-3" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3">
              {list.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <UsersRound className="size-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">
                    {term ? "No people found" : "No contacts yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Search by name or @username to add members.
                  </p>
                </div>
              ) : (
                list.map((person) => {
                  const isSelected = selected.some((item) => item.id === person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggle(person)}
                      className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-secondary/70"
                    >
                      <UserAvatar profile={person} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {person.display_name || person.username}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{person.username}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {isSelected && <Check className="size-3" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-secondary text-muted-foreground"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Group" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium">Group photo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Optional. You can add it later.
                </p>
              </div>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickPhoto}
              />
            </div>

            <label className="mt-6 block text-xs font-medium text-muted-foreground">
              Group name
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekend football"
              maxLength={80}
              className="mt-1.5 h-10"
              autoFocus
            />

            <label className="mt-5 block text-xs font-medium text-muted-foreground">
              Description <span className="font-normal">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="What is this group for?"
              className="mt-1.5 resize-none"
            />
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-2">
            <SettingToggle
              label="Only admins can send messages"
              description="Announcement-style group."
              checked={announceOnly}
              onChange={setAnnounceOnly}
            />
            <SettingToggle
              label="Members can add people"
              description="Members can invite others without admin approval."
              checked={membersCanAdd}
              onChange={setMembersCanAdd}
            />
            <SettingToggle
              label="Approve new members"
              description="Admins review joins through invite links."
              checked={approveMembers}
              onChange={setApproveMembers}
            />
            <p className="pt-2 text-[0.7rem] leading-5 text-muted-foreground">
              Other group permissions live in group information after creation.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary">
                {photoPreview ? (
                  <img src={photoPreview} alt="Group" className="size-full object-cover" />
                ) : (
                  <UsersRound className="size-6" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title || "Group name"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.length} member{selected.length === 1 ? "" : "s"}
                  {announceOnly ? " · admins post" : ""}
                </p>
              </div>
            </div>
            {description && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {selected.map((person) => (
                <span
                  key={person.id}
                  className="flex items-center gap-1.5 rounded-full bg-secondary py-1 pr-2 pl-1 text-xs"
                >
                  <UserAvatar profile={person} size="xs" />
                  {person.display_name.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="glass safe-bottom flex gap-2 border-x-0 border-b-0 px-4 py-3">
        {step > 0 && (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setStep(step - 1)}
            disabled={busy}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
        {step < 3 ? (
          <Button
            className="flex-1 gap-1.5"
            disabled={step === 0 && selected.length === 0}
            onClick={() => {
              if (step === 1 && title.trim().length < 2) {
                setError("Give the group a name.");
                return;
              }
              setError(null);
              setStep(step + 1);
            }}
          >
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => void create()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create group"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-[var(--primary)]"
      />
    </label>
  );
}
