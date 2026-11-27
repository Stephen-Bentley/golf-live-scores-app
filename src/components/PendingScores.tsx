"use client";

import { Alert, Button, Card } from "@/components/ui";
import type { QueuedScore } from "@/lib/offline-queue";

export function PendingScores({ queue, sending, error, nameFor, choose, retry }: {
  queue: QueuedScore[];
  sending: boolean;
  error: string;
  nameFor: (targetId: string) => string;
  choose: (entry: QueuedScore, keepQueued: boolean) => void;
  retry: (entry: QueuedScore, discard?: boolean) => void;
}) {
  if (!queue.length && !error) return null;
  return (
    <Card className="mt-4 space-y-3">
      <h2 className="font-semibold text-emerald-950">Pending scores</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="divide-y divide-stone-200">
        {queue.map((item) => (
          <li key={item.id} className="space-y-2 py-2 text-sm">
            <p className="font-medium">Hole {item.holeNumber}</p>
            {item.scores.map((score) => {
              const conflict = item.conflict?.targetId === score.targetId ? item.conflict : undefined;
              return (
                <div key={score.targetId}>
                  <p>{nameFor(score.targetId)} · {conflict ? "Queued score" : "Pending sync"} {score.grossScore}</p>
                  {conflict && (
                    <>
                      <p>Saved score {conflict.serverScore ?? "—"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => choose(item, false)}>Keep saved score</Button>
                        <Button onClick={() => choose(item, true)}>Keep queued score</Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {item.error && (
              <>
                <Alert tone="warning">{item.error}</Alert>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={sending} onClick={() => retry(item)}>Retry pending score</Button>
                  <Button variant="quiet" disabled={sending} onClick={() => retry(item, true)}>Discard pending score</Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
