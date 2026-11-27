"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";

export function SpectatorSharing({ roundId }: { roundId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/rounds/${roundId}/spectator-link`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load spectator sharing.");
        setToken((await response.json()).token);
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Could not load spectator sharing. Refresh to try again.");
        }
      });
    return () => controller.abort();
  }, [endpoint]);

  async function update(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(endpoint, { method });
      if (!response.ok) throw new Error("Could not update spectator sharing.");
      setToken((await response.json()).token);
    } catch {
      setError("Could not update spectator sharing. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const link = token ? `${window.location.origin}/spectator#${token}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Select the link to copy it.");
    }
  }

  return (
    <section className="space-y-3 border-t border-stone-200 pt-6">
      <h3 className="font-semibold text-emerald-950">Spectator leaderboard</h3>
      <p className="text-sm text-stone-600">Anyone with this link can see live standings and holes played.</p>
      {error && <Alert tone="error">{error}</Alert>}
      {ready && (token ? (
        <>
          <Input label="Spectator link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>{copied ? "Link copied" : "Copy spectator link"}</Button>
            <Button variant="quiet" onClick={() => void update("DELETE")} disabled={busy}>Revoke spectator link</Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => void update("POST")} disabled={busy}>Enable spectator link</Button>
      ))}
    </section>
  );
}
