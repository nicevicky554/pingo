import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { durationLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CallKind = "voice" | "video";
type Phase = "outgoing" | "incoming" | "connecting" | "active";

type CallPeer = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_path?: string | null;
  public_avatar_url?: string | null;
};

type CallSession = {
  phase: Phase;
  callId: string;
  conversationId: string;
  peer: CallPeer;
  kind: CallKind;
  incomingOffer?: RTCSessionDescriptionInit;
  muted: boolean;
  cameraOff: boolean;
};

type CallContextValue = {
  active: boolean;
  startCall: (input: {
    conversationId: string;
    kind: CallKind;
    peer: CallPeer;
  }) => Promise<void>;
};

const CallContext = createContext<CallContextValue>({
  active: false,
  startCall: async () => undefined,
});

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as
    | string
    | undefined;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCredential,
    });
  }
  return servers;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [session, setSession] = useState<CallSession | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionRef = useRef<CallSession | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const opsRef = useRef<{
    invite: (payload: Record<string, unknown>) => void;
    answer: (payload: Record<string, unknown>) => void;
    candidate: (payload: Record<string, unknown>) => void;
    remoteEnd: (payload: Record<string, unknown>) => void;
  }>({
    invite: () => undefined,
    answer: () => undefined,
    candidate: () => undefined,
    remoteEnd: () => undefined,
  });

  const outgoingChannels = useRef(new Map<string, RealtimeChannel>());
  const outgoingReady = useRef(new Set<string>());
  const outgoingQueue = useRef(new Map<string, unknown[]>());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const updateSession = useCallback((patch: Partial<CallSession>) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      sessionRef.current = next;
      return next;
    });
  }, []);

  const sendSignal = useCallback(
    async (peerId: string, event: string, payload: Record<string, unknown>) => {
      let channel = outgoingChannels.current.get(peerId);
      if (!channel) {
        channel = supabase.channel(`user:${peerId}`, {
          config: { private: true },
        });
        outgoingChannels.current.set(peerId, channel);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            outgoingReady.current.add(peerId);
            const queue = outgoingQueue.current.get(peerId) ?? [];
            queue.forEach((message) => {
              void channel!.send(message as never);
            });
            outgoingQueue.current.delete(peerId);
          }
        });
      }
      const message = { type: "broadcast" as const, event, payload };
      if (outgoingReady.current.has(peerId)) {
        await channel.send(message);
      } else {
        outgoingQueue.current.set(peerId, [
          ...(outgoingQueue.current.get(peerId) ?? []),
          message,
        ]);
      }
    },
    [],
  );

  const teardown = useCallback(
    (state: "ended" | "declined" | "missed" | "cancelled" | "failed") => {
      const current = sessionRef.current;
      if (!current) return;
      const duration = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : null;

      void supabase
        .from("calls")
        .update({
          status: state,
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          end_reason: state,
        })
        .eq("id", current.callId);

      const participantState =
        state === "declined"
          ? "declined"
          : state === "missed"
            ? "missed"
            : "left";
      void supabase
        .from("call_participants")
        .update({ state: participantState, left_at: new Date().toISOString() })
        .eq("call_id", current.callId)
        .eq("user_id", profile?.id ?? "");

      void sendSignal(current.peer.id, "call:end", {
        call_id: current.callId,
        reason: state,
      });

      pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      pendingCandidates.current = [];
      startedAtRef.current = null;
      setRemoteStream(null);
      setLocalStream(null);
      setSeconds(0);
      setSession(null);
      sessionRef.current = null;
      if (state === "missed") setNotice("No answer. The call was marked missed.");
      if (state === "failed") setNotice("The call could not connect.");
    },
    [profile?.id, sendSignal],
  );

  /** Create the peer connection and attach local media. */
  const preparePeer = useCallback(
    async (kind: CallKind, peerId: string, callId: string) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal(peerId, "call:ice", {
            call_id: callId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          const current = sessionRef.current;
          if (current && current.phase !== "active") {
            startedAtRef.current = startedAtRef.current ?? Date.now();
            updateSession({ phase: "active" });
          }
        }
        if (pc.connectionState === "failed") {
          setNotice("The call connection failed. Check your network and TURN configuration.");
          teardown("failed");
        }
      };
      return { pc, stream };
    },
    [sendSignal, teardown, updateSession],
  );

  const startCall = useCallback(
    async ({
      conversationId,
      kind,
      peer,
    }: {
      conversationId: string;
      kind: CallKind;
      peer: CallPeer;
    }) => {
      if (!profile || sessionRef.current) return;
      if (!peer?.id) {
        setNotice("Calls need a direct conversation.");
        return;
      }
      setNotice(null);
      setSession({
        phase: "outgoing",
        callId: "pending",
        conversationId,
        peer,
        kind,
        muted: false,
        cameraOff: false,
      });

      try {
        const { data: callRow, error } = await supabase
          .from("calls")
          .insert({
            conversation_id: conversationId,
            initiator_id: profile.id,
            kind,
            status: "ringing",
          })
          .select("id")
          .single();
        if (error) throw error;

        await supabase.from("call_participants").insert({
          call_id: callRow.id,
          user_id: peer.id,
          state: "invited",
        });

        const { pc } = await preparePeer(kind, peer.id, callRow.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        setSession((current) => {
          if (!current) return current;
          const next = { ...current, callId: callRow.id };
          sessionRef.current = next;
          return next;
        });

        await sendSignal(peer.id, "call:invite", {
          call_id: callRow.id,
          conversation_id: conversationId,
          kind,
          offer,
          caller: {
            id: profile.id,
            display_name: profile.display_name,
            username: profile.username,
            avatar_path: profile.avatar_path,
            public_avatar_url: profile.public_avatar_url,
          },
        });
      } catch (err) {
        setNotice(
          err instanceof Error ? err.message : "The call could not be started.",
        );
        const current = sessionRef.current as CallSession | null;
        if (current && current.callId !== "pending") {
          void supabase
            .from("calls")
            .update({ status: "failed", ended_at: new Date().toISOString() })
            .eq("id", current.callId);
        }
        pcRef.current?.close();
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setSession(null);
        sessionRef.current = null;
      }
    },
    [preparePeer, profile, sendSignal],
  );

  const handleInvite = useCallback(
    (payload: Record<string, unknown>) => {
      if (!profile) return;
      const current = sessionRef.current;
      const callId = String(payload.call_id ?? "");
      const caller = payload.caller as CallPeer | undefined;
      if (!callId || !caller?.id) return;

      if (current) {
        // Already busy: decline the new call server-side.
        void supabase
          .from("calls")
          .update({
            status: "declined",
            ended_at: new Date().toISOString(),
            end_reason: "busy",
          })
          .eq("id", callId);
        void sendSignal(caller.id, "call:end", {
          call_id: callId,
          reason: "busy",
        });
        return;
      }

      setNotice(null);
      const next: CallSession = {
        phase: "incoming",
        callId,
        conversationId: String(payload.conversation_id ?? ""),
        peer: caller,
        kind: payload.kind === "video" ? "video" : "voice",
        incomingOffer: payload.offer as RTCSessionDescriptionInit,
        muted: false,
        cameraOff: false,
      };
      sessionRef.current = next;
      setSession(next);
    },
    [profile, sendSignal],
  );

  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.phase !== "incoming" || !current.incomingOffer) return;
    updateSession({ phase: "connecting" });
    try {
      const { pc } = await preparePeer(
        current.kind,
        current.peer.id,
        current.callId,
      );
      await pc.setRemoteDescription(current.incomingOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      for (const candidate of pendingCandidates.current) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingCandidates.current = [];

      await supabase
        .from("calls")
        .update({
          status: "accepted",
          answered_at: new Date().toISOString(),
        })
        .eq("id", current.callId);

      await supabase
        .from("call_participants")
        .update({ state: "joined", joined_at: new Date().toISOString() })
        .eq("call_id", current.callId)
        .eq("user_id", profile?.id ?? "");

      startedAtRef.current = Date.now();
      await sendSignal(current.peer.id, "call:answer", {
        call_id: current.callId,
        answer,
      });
      updateSession({ phase: "connecting", incomingOffer: undefined });
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Could not open your microphone or camera.",
      );
      teardown("failed");
    }
  }, [preparePeer, profile?.id, sendSignal, teardown, updateSession]);

  const declineCall = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    void supabase
      .from("calls")
      .update({
        status: "declined",
        ended_at: new Date().toISOString(),
        end_reason: "declined",
      })
      .eq("id", current.callId);
    void supabase
      .from("call_participants")
      .update({ state: "declined" })
      .eq("call_id", current.callId)
      .eq("user_id", profile?.id ?? "");
    void sendSignal(current.peer.id, "call:end", {
      call_id: current.callId,
      reason: "declined",
    });
    setSession(null);
    sessionRef.current = null;
  }, [profile?.id, sendSignal]);

  const handleAnswer = useCallback(async (payload: Record<string, unknown>) => {
    const current = sessionRef.current;
    if (!current || String(payload.call_id) !== current.callId) return;
    const pc = pcRef.current;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(payload.answer as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidates.current) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingCandidates.current = [];
      updateSession({ phase: "connecting" });
    } catch {
      setNotice("The call answer could not be applied.");
    }
  }, [updateSession]);

  const handleCandidate = useCallback(
    async (payload: Record<string, unknown>) => {
      const current = sessionRef.current;
      if (!current || String(payload.call_id) !== current.callId) return;
      const candidate = payload.candidate as RTCIceCandidateInit;
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidates.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => undefined);
    },
    [],
  );

  const handleRemoteEnd = useCallback(
    (payload: Record<string, unknown>) => {
      const current = sessionRef.current;
      if (!current || String(payload.call_id) !== current.callId) return;
      const reason = String(payload.reason ?? "ended");
      teardown(
        reason === "declined" || reason === "busy"
          ? "declined"
          : reason === "missed"
            ? "missed"
            : "ended",
      );
    },
    [teardown],
  );

  opsRef.current = {
    invite: handleInvite,
    answer: (payload) => void handleAnswer(payload),
    candidate: (payload) => void handleCandidate(payload),
    remoteEnd: handleRemoteEnd,
  };

  // Inbox: only this user can read `user:<id>`.
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel(`user:${profile.id}`, {
      config: { private: true },
    });
    channel
      .on("broadcast", { event: "call:invite" }, ({ payload }) =>
        opsRef.current.invite(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:answer" }, ({ payload }) =>
        opsRef.current.answer(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:ice" }, ({ payload }) =>
        opsRef.current.candidate(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:end" }, ({ payload }) =>
        opsRef.current.remoteEnd(payload as Record<string, unknown>),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Ring timeout and duration timer.
  useEffect(() => {
    if (!session) return;
    if (session.phase === "incoming") {
      const timer = window.setTimeout(() => {
        if (sessionRef.current?.phase !== "incoming") return;
        const current = sessionRef.current;
        void supabase
          .from("calls")
          .update({
            status: "missed",
            ended_at: new Date().toISOString(),
            end_reason: "no_answer",
          })
          .eq("id", current.callId);
        void supabase
          .from("call_participants")
          .update({ state: "missed" })
          .eq("call_id", current.callId)
          .eq("user_id", profile?.id ?? "");
        void sendSignal(current.peer.id, "call:end", {
          call_id: current.callId,
          reason: "missed",
        });
        setSession(null);
        sessionRef.current = null;
        setNotice("Missed call.");
      }, 30_000);
      return () => window.clearTimeout(timer);
    }
    if (session.phase === "outgoing") {
      const timer = window.setTimeout(() => {
        if (sessionRef.current?.phase !== "outgoing") return;
        teardown("missed");
      }, 35_000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [session?.phase, profile?.id, sendSignal, teardown]);

  useEffect(() => {
    if (session?.phase !== "active") return;
    const interval = window.setInterval(() => {
      if (startedAtRef.current) {
        setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [session?.phase]);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      outgoingChannels.current.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = stream.getAudioTracks().some((track) => track.enabled);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !enabled;
    });
    updateSession({ muted: enabled });
  }, [updateSession]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = stream.getVideoTracks().some((track) => track.enabled);
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !enabled;
    });
    updateSession({ cameraOff: enabled });
  }, [updateSession]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream && session?.kind === "voice") {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, localStream, session?.phase, session?.kind]);

  const value = useMemo<CallContextValue>(
    () => ({ active: Boolean(session), startCall }),
    [session, startCall],
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      {notice && (
        <div className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-md rounded-lg border border-border bg-card px-4 py-2.5 text-center text-xs font-medium">
          <button
            type="button"
            className="w-full"
            onClick={() => setNotice(null)}
          >
            {notice}
          </button>
        </div>
      )}

      {session && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#081218] text-white">
          {session.kind === "voice" && (
            <audio ref={remoteAudioRef} autoPlay className="hidden" />
          )}

          <div className="flex items-center gap-3 px-4 py-4">
            <UserAvatar profile={session.peer} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {session.peer.display_name || session.peer.username || "PINGO call"}
              </p>
              <p className="text-xs text-white/60">
                {session.phase === "incoming"
                  ? `Incoming ${session.kind} call`
                  : session.phase === "outgoing"
                    ? "Calling…"
                    : session.phase === "connecting"
                      ? "Connecting…"
                      : durationLabel(seconds)}
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide">
              {session.kind}
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {session.kind === "video" ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="size-full bg-black object-contain"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute right-4 bottom-4 h-36 w-28 rounded-xl border border-white/20 bg-black object-cover sm:h-44 sm:w-36"
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <UserAvatar profile={session.peer} size="xl" />
                <p className="text-lg font-semibold">
                  {session.phase === "active"
                    ? durationLabel(seconds)
                    : session.phase === "incoming"
                      ? "Incoming voice call"
                      : "Ringing…"}
                </p>
                {session.phase !== "incoming" && session.phase !== "outgoing" && (
                  <p className="max-w-xs text-center text-xs text-white/50">
                    Audio is live over WebRTC. Group calls require the SFU phase.
                  </p>
                )}
              </div>
            )}

            {session.phase === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="size-7 animate-spin" />
              </div>
            )}
          </div>

          <div className="safe-bottom flex items-center justify-center gap-4 px-4 py-6">
            {session.phase === "incoming" ? (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  className="h-14 flex-1 rounded-full"
                  onClick={declineCall}
                >
                  <PhoneOff className="size-5" /> Decline
                </Button>
                <Button
                  size="lg"
                  className="h-14 flex-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => void acceptCall()}
                >
                  <Phone className="size-5" /> Accept
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={session.muted ? "Unmute microphone" : "Mute microphone"}
                  className="size-12 rounded-full bg-white/10 text-white hover:bg-white/20"
                  onClick={toggleMute}
                >
                  {session.muted ? (
                    <MicOff className="size-5" />
                  ) : (
                    <Mic className="size-5" />
                  )}
                </Button>
                {session.kind === "video" && (
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={session.cameraOff ? "Turn camera on" : "Turn camera off"}
                    className="size-12 rounded-full bg-white/10 text-white hover:bg-white/20"
                    onClick={toggleCamera}
                  >
                    {session.cameraOff ? (
                      <VideoOff className="size-5" />
                    ) : (
                      <VideoIcon className="size-5" />
                    )}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label="End call"
                  className="size-14 rounded-full"
                  onClick={() => teardown("ended")}
                >
                  <PhoneOff className="size-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
