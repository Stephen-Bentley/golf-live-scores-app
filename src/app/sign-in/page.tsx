"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Topbar, Input, Button, Alert, Card } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"guest" | "email">("guest");

  async function startAsGuest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: guestName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start hosting");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start hosting");
    } finally {
      setLoading(false);
    }
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.devToken) setDevToken(data.devToken);
      else setError("Check your email for a sign-in link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyDevToken() {
    if (!devToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: devToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell width="sm" center>
      <Topbar />
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
        Host access
      </p>
      <h1 className="mt-1 text-2xl font-bold text-emerald-950">Host a round</h1>
      <p className="mt-2 text-sm text-stone-600">
        Start with just a name — no email required. Email sign-in is optional for
        returning hosts.
      </p>

      <div className="mt-6 flex gap-2">
        <Button
          type="button"
          variant={mode === "guest" ? "primary" : "secondary"}
          onClick={() => setMode("guest")}
        >
          Quick start
        </Button>
        <Button
          type="button"
          variant={mode === "email" ? "primary" : "secondary"}
          onClick={() => setMode("email")}
        >
          Email link
        </Button>
      </div>

      {mode === "guest" ? (
        <form onSubmit={startAsGuest} className="mt-6 space-y-4">
          <Input
            label="Your name"
            required
            maxLength={40}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="e.g. Sam"
            hint="Shown when you join the leaderboard as a player"
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Starting…" : "Continue as host"}
          </Button>
        </form>
      ) : (
        <form onSubmit={requestLink} className="mt-6 space-y-4">
          <Input
            label="Email address"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Working…" : "Send magic link"}
          </Button>
        </form>
      )}

      {devToken && (
        <Card className="mt-6 border-emerald-200 bg-emerald-50">
          <p className="text-sm text-emerald-900">Development magic link ready.</p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-3 border-emerald-700 text-emerald-900"
            onClick={verifyDevToken}
            disabled={loading}
          >
            Open demo magic link
          </Button>
        </Card>
      )}
    </PageShell>
  );
}
