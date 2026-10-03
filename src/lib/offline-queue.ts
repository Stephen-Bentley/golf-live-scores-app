/**
 * Client-side offline score queue (localStorage).
 * Used by the score entry page to buffer writes when offline.
 */

export type QueuedScore = {
  id: string;
  roundId: string;
  playerId: string;
  holeNumber: number;
  grossScore: number;
  clientVersion?: number;
  queuedAt: string;
};

const PREFIX = "fairway_offline_scores_";

function storageKey(roundId: string, playerId: string) {
  return `${PREFIX}${roundId}_${playerId}`;
}

export function loadQueue(roundId: string, playerId: string): QueuedScore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(roundId, playerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedScore[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(
  roundId: string,
  playerId: string,
  items: QueuedScore[]
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(roundId, playerId), JSON.stringify(items));
}

export function enqueueScore(
  roundId: string,
  playerId: string,
  item: Omit<QueuedScore, "id" | "queuedAt" | "roundId" | "playerId">
): QueuedScore[] {
  const queue = loadQueue(roundId, playerId).filter(
    (q) => q.holeNumber !== item.holeNumber
  );
  const next: QueuedScore = {
    id: `${Date.now()}_${item.holeNumber}`,
    roundId,
    playerId,
    holeNumber: item.holeNumber,
    grossScore: item.grossScore,
    clientVersion: item.clientVersion,
    queuedAt: new Date().toISOString(),
  };
  queue.push(next);
  saveQueue(roundId, playerId, queue);
  return queue;
}

export function clearQueue(roundId: string, playerId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(roundId, playerId));
}

export function removeFromQueue(
  roundId: string,
  playerId: string,
  holeNumber: number
) {
  const queue = loadQueue(roundId, playerId).filter(
    (q) => q.holeNumber !== holeNumber
  );
  saveQueue(roundId, playerId, queue);
  return queue;
}
