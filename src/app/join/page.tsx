"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell, Topbar, Input, Button, Alert } from "@/components/ui";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const [joinCode, setJoinCode] = useState(
    (searchParams.get("joinCode") || "").toUpperCase()
  );
  const [displayName, setDisplayName] = useState("");
  const [playingHandicap, setPlayingHandicap] = useState(0);
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/rounds/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteCode ? { inviteCode } : {
          joinCode,
          displayName,
          playingHandicap: Number(playingHandicap),
          ...(teamName.trim() ? { teamName: teamName.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Join failed");
      router.push(inviteCode ? `/rounds/${data.round.id}/score` : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setLoading(false);
    }
  }

  if (inviteCode) {
    return (
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <p className="text-sm text-stone-600">Open the player scorecard assigned to this link.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" fullWidth disabled={loading}>{loading ? "Joining…" : "Open score entry"}</Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <p className="text-sm text-stone-600">Enter the join code from your host, your display name, and your playing handicap.</p>
      <Input
        label="Join code"
        required
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        className="uppercase tracking-widest"
        placeholder="ABCDEF"
      />
      <Input
        label="Display name"
        required
        maxLength={40}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Your name"
      />
      <Input
        label="Playing handicap"
        type="number"
        min={0}
        max={54}
        required
        value={playingHandicap}
        onChange={(e) => setPlayingHandicap(Number(e.target.value))}
        hint="Whole number from 0 to 54 for this round"
      />
      <Input
        label="Team name (optional)"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="e.g. Pair A or Red team"
        hint="Enter your competition team if your host gave you one."
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? "Joining…" : "Join round"}
      </Button>
    </form>
  );
}

export default function JoinPage() {
  return (
    <PageShell width="sm" center>
      <Topbar />
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
        Player access
      </p>
      <h1 className="mt-1 text-2xl font-bold text-emerald-950">Join a round</h1>
      <Suspense fallback={<p className="mt-8 text-sm text-stone-500">Loading…</p>}>
        <JoinForm />
      </Suspense>
    </PageShell>
  );
}
