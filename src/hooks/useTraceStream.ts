"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// ─── Gateway Pattern ──────────────────────────────────────────
// In production (Cloud Run), use NEXT_PUBLIC_TRACE_STREAM_URL directly.
// In sandbox/development, use relative path + XTransformPort for gateway routing.
const TRACE_STREAM_URL = process.env.NEXT_PUBLIC_TRACE_STREAM_URL || "";
const IS_CLOUD_RUN = TRACE_STREAM_URL !== "";

// ─── Types ────────────────────────────────────────────────────
export interface TraceEvent {
  case_id: string;
  trace_id: string;
  step: number;
  rule_id: string;
  rule_name: string;
  decision: "approve" | "deny" | "escalate" | "review" | "info";
  confidence: number;
  reason: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  broadcast_at?: string;
}

export interface GatePendingEvent {
  case_id: string;
  gate_id: string;
  gate_type: string;
  description: string;
  assigned_to?: string;
  priority: "low" | "medium" | "high" | "critical";
  created_at: string;
  broadcast_at?: string;
}

export interface GateResolvedEvent {
  case_id: string;
  gate_id: string;
  resolved_by: string;
  resolution: "approved" | "denied" | "escalated" | "deferred";
  notes?: string;
  resolved_at: string;
  broadcast_at?: string;
}

export interface CaseCreatedEvent {
  case_id: string;
  patient_id: string;
  claim_id: string;
  created_at: string;
  initial_state: string;
  broadcast_at?: string;
}

export interface CaseStateChangedEvent {
  case_id: string;
  from_state: string;
  to_state: string;
  transition_reason: string;
  timestamp: string;
  broadcast_at?: string;
}

export interface TraceStreamState {
  /** Whether socket is connected */
  connected: boolean;
  /** Currently subscribed case IDs */
  subscribedCases: string[];
  /** Latest trace events for subscribed cases (keyed by case_id) */
  traceEvents: Record<string, TraceEvent[]>;
  /** Pending HITL gates for subscribed cases (keyed by case_id) */
  pendingGates: Record<string, GatePendingEvent[]>;
  /** Latest case state changes (keyed by case_id) */
  stateChanges: Record<string, CaseStateChangedEvent>;
  /** Latest case created events */
  caseCreatedEvents: CaseCreatedEvent[];
  /** Subscribe to a case's real-time events */
  subscribeToCase: (caseId: string) => void;
  /** Unsubscribe from a case's real-time events */
  unsubscribeFromCase: (caseId: string) => void;
  /** Clear all trace events for a case */
  clearTraceEvents: (caseId: string) => void;
  /** Connection error, if any */
  error: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────
export function useTraceStream(): TraceStreamState {
  const socketRef = useRef<Socket | null>(null);
  const subscribedCasesRef = useRef<Set<string>>(new Set());

  const [connected, setConnected] = useState(false);
  const [subscribedCases, setSubscribedCases] = useState<string[]>([]);
  const [traceEvents, setTraceEvents] = useState<Record<string, TraceEvent[]>>({});
  const [pendingGates, setPendingGates] = useState<Record<string, GatePendingEvent[]>>({});
  const [stateChanges, setStateChanges] = useState<Record<string, CaseStateChangedEvent>>({});
  const [caseCreatedEvents, setCaseCreatedEvents] = useState<CaseCreatedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Initialize socket connection ──────────────────────────
  useEffect(() => {
    const socket: Socket = io(IS_CLOUD_RUN ? TRACE_STREAM_URL : "/", {
      transports: ["polling", "websocket"], // Polling first — works through Caddy gateway
      upgrade: true, // Will upgrade to websocket if available
      // Only use XTransformPort in sandbox mode (not Cloud Run)
      ...(IS_CLOUD_RUN ? {} : { query: { XTransformPort: "3003" } }),
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      autoConnect: true,
    });

    socketRef.current = socket;

    // ── Connection events ─────────────────────────────────
    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      console.log("[TraceStream] Connected:", socket.id);

      // Re-subscribe to cases after reconnect
      subscribedCasesRef.current.forEach((caseId) => {
        socket.emit("subscribe:case", { case_id: caseId });
      });
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      console.log("[TraceStream] Disconnected:", reason);
    });

    // Throttle connection error logs to avoid console spam
    let lastErrorLog = 0;
    socket.on("connect_error", (err) => {
      setError(err.message);
      const now = Date.now();
      // Only log3log once every 30 seconds to avoid console spam
      if (now - lastErrorLog > 30000) {
        lastErrorLog = now;
        console.warn("[TraceStream] Connection error (suppressed further logs for 30s):", err.message);
      }
    });

    // ── Trace events ──────────────────────────────────────
    socket.on("trace:event", (event: TraceEvent) => {
      setTraceEvents((prev) => {
        const caseEvents = prev[event.case_id] ?? [];
        return {
          ...prev,
          [event.case_id]: [...caseEvents, event],
        };
      });
    });

    // ── Gate events ───────────────────────────────────────
    socket.on("gate:pending", (event: GatePendingEvent) => {
      setPendingGates((prev) => {
        const caseGates = prev[event.case_id] ?? [];
        // Avoid duplicates by gate_id
        const exists = caseGates.some((g) => g.gate_id === event.gate_id);
        if (exists) return prev;
        return {
          ...prev,
          [event.case_id]: [...caseGates, event],
        };
      });
    });

    socket.on("gate:resolved", (event: GateResolvedEvent) => {
      setPendingGates((prev) => {
        const caseGates = prev[event.case_id] ?? [];
        return {
          ...prev,
          [event.case_id]: caseGates.filter(
            (g) => g.gate_id !== event.gate_id
          ),
        };
      });
    });

    // ── Case state changes ────────────────────────────────
    socket.on("case:state:changed", (event: CaseStateChangedEvent) => {
      setStateChanges((prev) => ({
        ...prev,
        [event.case_id]: event,
      }));
    });

    // ── Case created ──────────────────────────────────────
    socket.on("case:created", (event: CaseCreatedEvent) => {
      setCaseCreatedEvents((prev) => [...prev, event]);
    });

    // ── Cleanup ───────────────────────────────────────────
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Subscribe to a case ──────────────────────────────────
  const subscribeToCase = useCallback((caseId: string) => {
    if (!caseId) return;

    // Track locally even if socket isn't ready yet
    subscribedCasesRef.current.add(caseId);
    setSubscribedCases(Array.from(subscribedCasesRef.current));

    if (socketRef.current?.connected) {
      socketRef.current.emit("subscribe:case", { case_id: caseId });
    }
  }, []);

  // ── Unsubscribe from a case ─────────────────────────────
  const unsubscribeFromCase = useCallback((caseId: string) => {
    if (!caseId) return;

    subscribedCasesRef.current.delete(caseId);
    setSubscribedCases(Array.from(subscribedCasesRef.current));

    if (socketRef.current?.connected) {
      socketRef.current.emit("unsubscribe:case", { case_id: caseId });
    }

    // Clean up local state for this case
    setTraceEvents((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
    setPendingGates((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
    setStateChanges((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
  }, []);

  // ── Clear trace events for a case ───────────────────────
  const clearTraceEvents = useCallback((caseId: string) => {
    setTraceEvents((prev) => ({
      ...prev,
      [caseId]: [],
    }));
  }, []);

  return {
    connected,
    subscribedCases,
    traceEvents,
    pendingGates,
    stateChanges,
    caseCreatedEvents,
    subscribeToCase,
    unsubscribeFromCase,
    clearTraceEvents,
    error,
  };
}
