"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  findQueuedScore, loadQueue, queueStorageKey, resolveConflict, sendScoreWrite, writeQueueItem,
  type QueuedScore, type ScoreWrite, type SyncedScore, type SyncResult,
} from "./offline-queue";

export function useOfflineScores(
  roundId: string,
  actorId: string | null,
  onSaved: (kind: ScoreWrite["kind"], scores: SyncedScore[]) => void,
  onRemoteSync: () => Promise<void>,
) {
  const [queue, setQueue] = useState<QueuedScore[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryDelay, setRetryDelay] = useState(0);
  const active = useRef(false);
  const savedCallback = useRef(onSaved);
  const remoteCallback = useRef(onRemoteSync);
  savedCallback.current = onSaved;
  remoteCallback.current = onRemoteSync;

  const persist = useCallback((item: QueuedScore, remove = false) => {
    if (!actorId) return;
    writeQueueItem(roundId, actorId, item, remove);
    setQueue(loadQueue(roundId, actorId));
  }, [roundId, actorId]);

  const send = useCallback(async (item: QueuedScore): Promise<SyncResult> => {
    if (!actorId || active.current || !navigator.onLine) return { status: "pending" };
    active.current = true;
    setSending(true);
    try {
      const result = await sendScoreWrite(roundId, item);
      if (result.status === "pending") {
        setRetryDelay(result.retryDelay ?? 5000);
        return result;
      }
      setRetryDelay(0);
      try {
        const latest = loadQueue(roundId, actorId).find((entry) => entry.id === item.id);
        if (JSON.stringify(latest) === JSON.stringify(item)) {
          if (result.status === "conflict") persist({ ...item, conflict: result.conflict });
          if (result.status === "failed") persist({ ...item, error: result.error });
          if (result.status === "saved") persist(item, true);
        }
        setError("");
      } catch {
        setRetryDelay(5000);
        setError("Could not update pending scores on this device.");
      }
      if (result.status === "saved") savedCallback.current(item.kind, result.scores);
      return result;
    } finally {
      active.current = false;
      setSending(false);
    }
  }, [roundId, actorId, persist]);

  useEffect(() => {
    if (!actorId) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let refreshNeeded = false;

    const refresh = () => setQueue(loadQueue(roundId, actorId));
    const refreshSaved = () => {
      if (!refreshNeeded || !navigator.onLine) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void remoteCallback.current().then(() => {
          if (cancelled) return;
          refreshNeeded = false;
          refresh();
        }).catch(() => {
          if (!cancelled) setError("Refresh the scorecard to see the latest scores.");
        });
      }, 150);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith(`${queueStorageKey(roundId, actorId)}:`)) return;
      if (event.newValue === null || event.newValue === "null") {
        refreshNeeded = true;
        refreshSaved();
      } else if (!refreshNeeded) {
        refresh();
      }
    };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", refreshSaved);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", refreshSaved);
    };
  }, [roundId, actorId]);

  useEffect(() => {
    if (!actorId || sending) return;
    const syncNext = () => {
      const item = loadQueue(roundId, actorId).find((entry) => !entry.conflict && !entry.error);
      if (item) void send(item);
    };
    const timer = setTimeout(syncNext, retryDelay);
    window.addEventListener("online", syncNext);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", syncNext);
    };
  }, [roundId, actorId, queue, sending, retryDelay, send]);

  async function submit(write: ScoreWrite): Promise<SyncResult> {
    if (!actorId) return { status: "failed", error: "Join the round before saving scores." };
    const item = { ...write, id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` };
    const existing = loadQueue(roundId, actorId);
    if (write.scores.some(({ targetId }) => findQueuedScore(existing, write.holeNumber, targetId))) {
      return { status: "failed", error: "Resolve the pending score for this hole first." };
    }
    try {
      persist(item);
    } catch {
      const result = navigator.onLine ? await sendScoreWrite(roundId, write) : { status: "pending" as const };
      if (result.status === "saved") {
        savedCallback.current(write.kind, result.scores);
        return result;
      }
      return {
        status: "failed",
        error: result.status === "failed" ? result.error
          : "This device could not store the score for later. Check the connection and try again.",
      };
    }
    if (retryDelay) return { status: "pending" };
    return send(item);
  }

  function choose(item: QueuedScore, keepQueued: boolean) {
    if (!actorId) return;
    try {
      const current = loadQueue(roundId, actorId).find((entry) => entry.id === item.id);
      if (!current?.conflict || JSON.stringify(current) !== JSON.stringify(item)) return;
      const next = resolveConflict(current, keepQueued);
      persist(next ?? current, !next);
      setError("");
      if (!keepQueued && current.conflict.serverScore != null) {
        const { targetId, serverScore: grossScore, serverVersion: version } = current.conflict;
        savedCallback.current(current.kind, [{ targetId, holeNumber: current.holeNumber, grossScore, version }]);
      }
    } catch {
      setError("Could not update pending scores on this device.");
    }
  }

  function retry(item: QueuedScore, discard = false) {
    if (!actorId) return;
    try {
      const current = loadQueue(roundId, actorId).find((entry) => entry.id === item.id);
      if (!current?.error) return;
      persist({ ...current, error: undefined }, discard);
      setRetryDelay(0);
      setError("");
    } catch {
      setError("Could not update pending scores on this device.");
    }
  }

  return { queue, sending, error, submit, choose, retry };
}
