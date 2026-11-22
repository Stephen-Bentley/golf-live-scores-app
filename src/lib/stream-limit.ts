/**
 * Per-process protection for the polling leaderboard stream.
 * A reverse proxy should also enforce connection limits for multi-instance deploys.
 */
const activeStreams = new Map<string, number>();
const MAX_STREAMS_PER_SESSION = 2;

export function acquireStream(key: string): boolean {
  const active = activeStreams.get(key) ?? 0;
  if (active >= MAX_STREAMS_PER_SESSION) return false;
  activeStreams.set(key, active + 1);
  return true;
}

export function releaseStream(key: string) {
  const active = activeStreams.get(key) ?? 0;
  if (active <= 1) activeStreams.delete(key);
  else activeStreams.set(key, active - 1);
}

/** Test helper. */
export function clearStreamLimits() {
  activeStreams.clear();
}
