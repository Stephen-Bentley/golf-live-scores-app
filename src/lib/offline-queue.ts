/** Durable, versioned score writes scoped to a round and the signed-in scorer. */
export type ScoreTarget = { targetId: string; grossScore: number; clientVersion: number };

export type ScoreWrite = {
  kind: "player" | "fourball" | "scramble";
  holeNumber: number;
  scores: ScoreTarget[];
};

export type ScoreConflict = { targetId: string; serverScore: number | null; serverVersion: number };

export type QueuedScore = ScoreWrite & {
  id: string;
  conflict?: ScoreConflict;
  error?: string;
  legacy?: true;
};

type LegacyScore = { id: string; playerId: string; holeNumber: number; grossScore: number; clientVersion?: number };

export function queueStorageKey(roundId: string, actorId: string) {
  return `fairway_offline_scores_${roundId}_${actorId}`;
}

export function loadQueue(roundId: string, actorId: string): QueuedScore[] {
  const prefix = queueStorageKey(roundId, actorId);
  const items = new Map<string, QueuedScore>();
  try {
    const old: LegacyScore[] = JSON.parse(localStorage.getItem(prefix) ?? "[]");
    for (const item of old) {
      if (item?.id && item.playerId) items.set(item.id, {
        id: item.id, kind: "player", legacy: true, holeNumber: item.holeNumber,
        scores: [{ targetId: item.playerId, grossScore: item.grossScore, clientVersion: item.clientVersion ?? 0 }],
      });
    }
  } catch {
    // Read current entries even if the old queue is unavailable.
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${prefix}:`)) continue;
      const item: QueuedScore | null = JSON.parse(localStorage.getItem(key) ?? "null");
      if (item) items.set(item.id, item);
      else items.delete(key.slice(prefix.length + 1));
    }
  } catch {
    // Storage may be disabled by the browser.
  }
  return [...items.values()];
}

export function writeQueueItem(roundId: string, actorId: string, item: QueuedScore, remove = false) {
  const key = `${queueStorageKey(roundId, actorId)}:${item.id}`;
  if (remove && !item.legacy) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(remove ? null : item));
}

export function findQueuedScore(queue: QueuedScore[], holeNumber: number, targetId: string) {
  return queue.find((item) => item.holeNumber === holeNumber &&
    item.scores.some((score) => score.targetId === targetId));
}

export function resolveConflict(item: QueuedScore, keepQueued: boolean): QueuedScore | undefined {
  if (!item.conflict) return item;
  const { targetId, serverVersion } = item.conflict;
  const scores = keepQueued
    ? item.scores.map((score) => score.targetId === targetId ? { ...score, clientVersion: serverVersion } : score)
    : item.scores.filter((score) => score.targetId !== targetId);
  if (scores.length) return { ...item, scores, conflict: undefined };
}

export type SyncedScore = { targetId: string; holeNumber: number; grossScore: number; version: number; points?: number };
export type SyncResult =
  | { status: "saved"; scores: SyncedScore[] }
  | { status: "pending"; retryDelay?: number }
  | { status: "conflict"; conflict: ScoreConflict }
  | { status: "failed"; error: string };

export async function sendScoreWrite(roundId: string, item: ScoreWrite): Promise<SyncResult> {
  const { kind, holeNumber } = item;
  const { targetId, grossScore, clientVersion } = item.scores[0];
  const body = kind === "fourball"
    ? { holeNumber, scores: item.scores.map(({ targetId, ...score }) => ({ ...score, playerId: targetId })) }
    : { holeNumber, grossScore, clientVersion, ...(kind === "scramble" ? { fourballId: targetId } : { playerId: targetId }) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`/api/rounds/${roundId}/${kind === "scramble" ? "scramble-scores" : "scores"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 429 || response.status >= 500) {
      const seconds = Number(response.headers.get("retry-after"));
      return { status: "pending", retryDelay: response.status === 429 ? (seconds > 0 ? seconds * 1000 : 15_000) : 5000 };
    }
    const data = await response.json().catch(() => null);
    if (response.status === 409) {
      const conflict = kind === "scramble"
        ? { targetId, serverScore: data?.score?.grossScore ?? null, serverVersion: data?.score?.version ?? 0 }
        : { targetId: data?.playerId ?? targetId, serverScore: data?.serverScore ?? null, serverVersion: data?.serverVersion };
      if (typeof conflict.serverVersion === "number") return { status: "conflict", conflict };
    }
    if (!response.ok) {
      return { status: "failed", error: data?.error ?? `Could not save this score (HTTP ${response.status}).` };
    }
    const scores: SyncedScore[] = kind === "fourball"
      ? (data?.scores ?? []).map(({ playerId, ...score }: Omit<SyncedScore, "targetId"> & { playerId: string }) => ({ ...score, targetId: playerId }))
      : data?.score ? [{ ...data.score, targetId }] : [];
    const confirmed = item.scores.every((requested) => scores.some((saved) =>
      saved.targetId === requested.targetId && saved.holeNumber === holeNumber &&
      saved.grossScore === requested.grossScore && Number.isInteger(saved.version)
    ));
    return confirmed ? { status: "saved", scores } : { status: "pending" };
  } catch {
    return { status: "pending" };
  } finally {
    clearTimeout(timer);
  }
}
