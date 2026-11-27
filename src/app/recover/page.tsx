"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, PageShell } from "@/components/ui";

export default function RecoverScorecardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const readLink = () => {
      const value = window.location.hash.slice(1);
      const valid = /^[a-zA-Z0-9_-]{43}$/.test(value);
      setToken(valid ? value : undefined);
      setBusy(false);
      setError(valid ? "" : "This recovery link is unavailable. Ask the host for a new one.");
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);

  async function recover() {
    const currentToken = window.location.hash.slice(1);
    if (!/^[a-zA-Z0-9_-]{43}$/.test(currentToken)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rounds/recover", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: currentToken }),
      });
      const data = await response.json();
      if (window.location.hash.slice(1) !== currentToken) return;
      if (!response.ok) throw new Error(data.error || "Could not recover your scorecard.");
      router.replace(`/rounds/${data.roundId}/score`);
    } catch (err) {
      if (window.location.hash.slice(1) !== currentToken) return;
      setError(err instanceof Error ? err.message : "Could not recover your scorecard.");
      setBusy(false);
    }
  }

  return (
    <PageShell width="sm" center>
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold text-emerald-950">Recover your scorecard</h1>
        {error && <Alert tone="error">{error}</Alert>}
        {token && <Button disabled={busy} onClick={() => void recover()}>{busy ? "Recovering…" : "Open my scorecard"}</Button>}
      </Card>
    </PageShell>
  );
}
