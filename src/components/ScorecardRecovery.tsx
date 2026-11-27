"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

export function ScorecardRecovery({ roundId, playerId, playerName, locked }: {
  roundId: string;
  playerId: string;
  playerName: string;
  locked: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState("");

  async function update(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/rounds/${roundId}/players/${playerId}/recovery`, { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the recovery link.");
      setLink(method === "POST" ? {
        url: `${window.location.origin}/recover#${data.token}`, expiresAt: data.expiresAt,
      } : null);
      if (method === "DELETE") setMessage("Recovery link revoked.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update the recovery link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 text-sm text-stone-700">
      <summary className="cursor-pointer" aria-label={`Recover scorecard for ${playerName}`}>Recover scorecard</summary>
      <div className="mt-2 space-y-2">
        <p>Give this single-use link to {playerName}. Creating a new link replaces any previous recovery link.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || locked} onClick={() => void update("POST")}>Create recovery link</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void update("DELETE")}>Revoke recovery link</Button>
        </div>
        {link && (
          <>
            <Input id={`recovery-link-${playerId}`} label="Recovery link" value={link.url} readOnly onFocus={(event) => event.currentTarget.select()} />
            <p>Expires at {new Date(link.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
