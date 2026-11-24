import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { durationLabel } from "@/lib/format";
import { freshPrivateChannel } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  RefreshCw,
  SwitchCamera,
  Video as VideoIcon,
  VideoOff,
  Volume2,
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
  isCaller: boolean;
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

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * TURN credentials are minted by /api/turn on the server. The browser never
 * receives a long-lived provider secret. A static VITE_TURN_* pair is only
 * used as an explicit development fallback.
 */
async function iceServers(): Promise<RTCIceServer[]> {
  const servers: RTCIceServer[] = [...STUN_SERVERS];
  try {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/turn", {
      headers: data.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {},
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        iceServers?: RTCIceServer[];
      };
      if (Array.isArray(payload.iceServers)) {
        servers.push(...payload.iceServers);
        return servers;
      }
    }
  } catch {
    // Running without a serverless function (plain vite preview): fall back.
  }

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as
    | string
    | undefined;
  if (turnUrl && turnUser && turnCredential) {
    servers.push({
      urls: turnUrl.split(",").map((value) => value.trim()),
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
  const [reconnecting, setReconnecting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [outputDevice, setOutputDevice] = useState("default");
  const [quality, setQuality] = useState<{
    height: number;
    bitrateKbps: number;
    packetLoss: number;
    rttMs: number;
  } | null>(null);
  const retryRef = useRef(0);
  const facingRef = useRef<"user" | "environment">("user");
  const lastBytesRef = useRef<{ bytes: number; at: number } | null>(null);

  const sessionRef = useRef<CallSession | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const recordedCallIds = useRef(new Set<string>());
  const opsRef = useRef<{
    invite: (payload: Record<string, unknown>) => void;
    answer: (payload: Record<string, unknown>) => void;
    reoffer: (payload: Record<string, unknown>) => void;
    reanswer: (payload: Record<string, unknown>) => void;
    candidate: (payload: Record<string, unknown>) => void;
    remoteEnd: (payload: Record<string, unknown>) => void;
  }>({
    invite: () => undefined,
    answer: () => undefined,
    reoffer: () => undefined,
    reanswer: () => undefined,
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

      if (
        current.isCaller &&
        profile?.id &&
        current.conversationId &&
        current.callId &&
        !recordedCallIds.current.has(current.callId)
      ) {
        recordedCallIds.current.add(current.callId);
        const callId = current.callId;
        const outcome =
          state === "missed" || state === "declined" || state === "failed" ? state : "ended";
        void (async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const response = await fetch("/api/calls/log", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ callId, outcome, duration: duration ?? 0 }),
          }).catch(() => null);
          if (response && !response.ok) {
            console.warn("[PINGO] call log rejected", response.status);
          }
        })();
      }

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
      setReconnecting(false);
      setMinimized(false);
      setQuality(null);
      retryRef.current = 0;
      lastBytesRef.current = null;
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          kind === "video"
            ? {
                facingMode: facingRef.current,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks().forEach((track) => {
        track.contentHint = "detail";
      });

      const pc = new RTCPeerConnection({
        iceServers: await iceServers(),
        iceCandidatePoolSize: 4,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });
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
      pc.onicecandidateerror = (event) => {
        console.warn("[PINGO] ICE candidate error", event.errorCode, event.errorText);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          retryRef.current = 0;
          setReconnecting(false);
          const current = sessionRef.current;
          if (current && current.phase !== "active") {
            startedAtRef.current = startedAtRef.current ?? Date.now();
            updateSession({ phase: "active" });
          }
          return;
        }
        if (pc.connectionState === "disconnected") {
          setReconnecting(true);
          return;
        }
        if (pc.connectionState === "failed") {
          if (retryRef.current < 2) {
            retryRef.current += 1;
            setReconnecting(true);
            try {
              pc.restartIce();
              void (async () => {
                try {
                  const offer = await pc.createOffer({ iceRestart: true });
                  await pc.setLocalDescription(offer);
                  await sendSignal(peerId, "call:reoffer", {
                    call_id: callId,
                    offer,
                  });
                } catch (error) {
                  console.warn("[PINGO] ICE renegotiation failed", error);
                }
              })();
            } catch (error) {
              console.warn("[PINGO] ICE restart failed", error);
            }
            window.setTimeout(() => {
              if (pcRef.current === pc && pc.connectionState === "failed") {
                setReconnecting(false);
                setNotice(
                  "The call could not recover. A TURN relay may be required on this network.",
                );
                teardown("failed");
              }
            }, 12_000);
          } else {
            setReconnecting(false);
            setNotice("The call connection failed. Check your network and TURN setup.");
            teardown("failed");
          }
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
        isCaller: true,
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
        isCaller: false,
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

  const handleReoffer = useCallback(async (payload: Record<string, unknown>) => {
    const current = sessionRef.current;
    const pc = pcRef.current;
    if (!current || !pc || String(payload.call_id) !== current.callId) return;
    if (pc.signalingState !== "stable") return;
    try {
      await pc.setRemoteDescription(payload.offer as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidates.current) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingCandidates.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(current.peer.id, "call:reanswer", {
        call_id: current.callId,
        answer,
      });
    } catch (error) {
      console.warn("[PINGO] could not answer ICE restart", error);
    }
  }, [sendSignal]);

  const handleReanswer = useCallback(async (payload: Record<string, unknown>) => {
    const current = sessionRef.current;
    const pc = pcRef.current;
    if (!current || !pc || String(payload.call_id) !== current.callId) return;
    if (pc.signalingState === "stable") return;
    try {
      await pc.setRemoteDescription(payload.answer as RTCSessionDescriptionInit);
    } catch (error) {
      console.warn("[PINGO] could not apply ICE restart answer", error);
    }
  }, []);

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
    reoffer: (payload) => void handleReoffer(payload),
    reanswer: (payload) => void handleReanswer(payload),
    candidate: (payload) => void handleCandidate(payload),
    remoteEnd: handleRemoteEnd,
  };

  // Inbox: only this user can read `user:<id>`.
  useEffect(() => {
    if (!profile?.id) return;
    const channel = freshPrivateChannel(`user:${profile.id}`, {
      private: true,
    });
    channel
      .on("broadcast", { event: "call:invite" }, ({ payload }) =>
        opsRef.current.invite(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:answer" }, ({ payload }) =>
        opsRef.current.answer(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:reoffer" }, ({ payload }) =>
        opsRef.current.reoffer(payload as Record<string, unknown>),
      )
      .on("broadcast", { event: "call:reanswer" }, ({ payload }) =>
        opsRef.current.reanswer(payload as Record<string, unknown>),
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

  // Original locally generated ringback / incoming tone.
  useEffect(() => {
    if (!session) return;
    if (session.phase !== "outgoing" && session.phase !== "incoming") return;
    let context: AudioContext | null = null;
    let interval: number | null = null;
    const playTone = () => {
      try {
        context ??= new AudioContext();
        if (context.state === "suspended") void context.resume();
        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        gain.connect(context.destination);
        const osc = context.createOscillator();
        osc.type = "sine";
        osc.frequency.value = session.phase === "incoming" ? 523 : 425;
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.45);
      } catch {
        // Audio output may be unavailable; signalling continues.
      }
    };
    playTone();
    interval = window.setInterval(
      playTone,
      session.phase === "incoming" ? 1400 : 3000,
    );
    return () => {
      if (interval) window.clearInterval(interval);
      void context?.close();
    };
  }, [session?.phase]);

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

  // Real connection statistics; video bitrate adapts to measured packet loss.
  useEffect(() => {
    if (session?.phase !== "active") return;
    const interval = window.setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let height = 0;
        let bytes = 0;
        let loss = 0;
        let rtt = 0;
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            height = report.frameHeight ?? height;
            bytes = Math.max(bytes, report.bytesReceived ?? 0);
            loss = Math.max(loss, (report.packetsLost ?? 0) > 0 && report.packetsReceived
              ? ((report.packetsLost ?? 0) / ((report.packetsLost ?? 0) + report.packetsReceived)) * 100
              : 0);
          }
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            rtt = Math.round((report.currentRoundTripTime ?? 0) * 1000);
          }
        });

        const now = Date.now();
        const previous = lastBytesRef.current;
        const bitrateKbps =
          previous && bytes > previous.bytes
            ? Math.round(((bytes - previous.bytes) * 8) / (now - previous.at))
            : 0;
        lastBytesRef.current = { bytes, at: now };
        setQuality({ height, bitrateKbps, packetLoss: Math.round(loss), rttMs: rtt });

        if (session.kind === "video") {
          const sender = pc
            .getSenders()
            .find((item) => item.track?.kind === "video");
          if (sender) {
            const params = sender.getParameters();
            const targetKbps = loss > 10 ? 450 : loss > 4 ? 900 : 2600;
            if (params.encodings?.length) {
              params.encodings = params.encodings.map((encoding) => ({
                ...encoding,
                maxBitrate: targetKbps * 1000,
                maxFramerate: loss > 8 ? 15 : 30,
              }));
              await sender.setParameters(params).catch(() => undefined);
            }
          }
        }
      } catch (error) {
        console.warn("[PINGO] call stats unavailable", error);
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [session?.phase, session?.kind]);

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

  const cycleAudioOutput = useCallback(async () => {
    const audio = remoteAudioRef.current as
      | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (!audio?.setSinkId) {
      setNotice("This browser does not expose audio output selection.");
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      if (outputs.length < 2) {
        setNotice("Only one audio output is available on this device.");
        return;
      }
      const index = Math.max(
        0,
        outputs.findIndex((device) => device.deviceId === outputDevice),
      );
      const next = outputs[(index + 1) % outputs.length];
      await audio.setSinkId(next.deviceId);
      setOutputDevice(next.deviceId);
      setNotice(`Audio output: ${next.label || "selected device"}`);
    } catch {
      setNotice("Audio output could not be changed.");
    }
  }, [outputDevice]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = stream.getVideoTracks().some((track) => track.enabled);
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !enabled;
    });
    updateSession({ cameraOff: enabled });
  }, [updateSession]);

  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const sender = pcRef.current
      ?.getSenders()
      .find((item) => item.track?.kind === "video");
    if (!stream || !sender) return;
    const next = facingRef.current === "user" ? "environment" : "user";
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const track = replacement.getVideoTracks()[0];
      if (!track) return;
      track.contentHint = "detail";
      await sender.replaceTrack(track);
      stream.getVideoTracks().forEach((old) => {
        stream.removeTrack(old);
        old.stop();
      });
      stream.addTrack(track);
      facingRef.current = next;
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (error) {
      console.warn("[PINGO] camera switch failed", error);
      setNotice("The other camera could not be opened on this device.");
    }
  }, []);

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
  }, [remoteStream, localStream, session?.phase, session?.kind, minimized]);

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

      {session && minimized && (
        <div className="fixed right-3 bottom-[72px] z-[60] flex w-[290px] items-center gap-2.5 rounded-xl border border-white/10 bg-[#0d1a22] p-2.5 text-white shadow-xl md:bottom-4">
          {session.kind === "video" ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="size-11 shrink-0 rounded-md bg-black object-cover"
            />
          ) : (
            <>
              <audio ref={remoteAudioRef} autoPlay className="hidden" />
              <UserAvatar profile={session.peer} size="sm" />
            </>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {session.peer.display_name || session.peer.username || "PINGO call"}
            </p>
            <p className="text-[0.65rem] text-white/60">
              {reconnecting
                ? "Reconnecting…"
                : session.phase === "active"
                  ? durationLabel(seconds)
                  : "Connecting…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex size-8 items-center justify-center rounded-full bg-white/10"
            aria-label="Expand call"
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => teardown("ended")}
            className="flex size-8 items-center justify-center rounded-full bg-destructive"
            aria-label="End call"
          >
            <PhoneOff className="size-4" />
          </button>
        </div>
      )}

      {session && !minimized && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#0d1a22] text-white">
          {session.kind === "voice" && (
            <audio ref={remoteAudioRef} autoPlay className="hidden" />
          )}

          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <UserAvatar profile={session.peer} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {session.peer.display_name || session.peer.username || "PINGO call"}
              </p>
              <p className="text-xs text-white/60">
                {reconnecting
                  ? "Reconnecting — keeping the call open…"
                  : session.phase === "incoming"
                    ? `Incoming ${session.kind} call`
                    : session.phase === "outgoing"
                      ? "Calling…"
                      : session.phase === "connecting"
                        ? "Connecting…"
                        : durationLabel(seconds)}
              </p>
            </div>
            {session.phase === "active" && quality && session.kind === "video" && (
              <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[0.6rem] font-medium tabular-nums sm:inline">
                {quality.height >= 2160
                  ? "4K"
                  : quality.height >= 1080
                    ? "1080p"
                    : quality.height >= 720
                      ? "720p"
                      : quality.height > 0
                        ? `${quality.height}p`
                        : "audio"}
                {" · "}
                {quality.bitrateKbps > 0
                  ? `${Math.round(quality.bitrateKbps / 100) / 10} Mbps`
                  : "measuring"}
              </span>
            )}
            {session.phase === "active" && (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Minimize call"
              >
                <Minimize2 className="size-4" />
              </button>
            )}
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
                {session.phase !== "incoming" && !session.cameraOff && (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute right-4 bottom-4 h-32 w-24 rounded-lg border border-white/20 bg-black object-cover sm:h-44 sm:w-32"
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 px-6">
                <UserAvatar profile={session.peer} size="xl" />
                <p className="text-lg font-semibold">
                  {session.phase === "active"
                    ? durationLabel(seconds)
                    : session.phase === "incoming"
                      ? "Incoming voice call"
                      : "Ringing…"}
                </p>
                {session.phase === "active" && (
                  <p className="max-w-xs text-center text-[0.7rem] text-white/50">
                    {quality
                      ? `Round-trip ${quality.rttMs} ms · ${quality.packetLoss}% packet loss`
                      : "Measuring connection…"}
                  </p>
                )}
              </div>
            )}

            {(session.phase === "connecting" || reconnecting) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
                {reconnecting ? (
                  <RefreshCw className="size-6 animate-spin" />
                ) : (
                  <Loader2 className="size-7 animate-spin" />
                )}
                <p className="text-xs text-white/70">
                  {reconnecting
                    ? "Network changed. Reconnecting…"
                    : "Establishing secure media…"}
                </p>
              </div>
            )}
          </div>

          <div className="safe-bottom flex items-center justify-center gap-3 px-4 py-6">
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
                  aria-label="Change audio output"
                  title="Speaker / audio output"
                  className="size-12 rounded-full bg-white/10 text-white hover:bg-white/20"
                  onClick={() => void cycleAudioOutput()}
                >
                  <Volume2 className="size-5" />
                </Button>
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
                  <>
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
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Switch camera"
                      className="size-12 rounded-full bg-white/10 text-white hover:bg-white/20"
                      onClick={() => void switchCamera()}
                    >
                      <SwitchCamera className="size-5" />
                    </Button>
                  </>
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
