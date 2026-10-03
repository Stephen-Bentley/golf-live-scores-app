"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PageShell,
  Topbar,
  Button,
  Card,
  Alert,
  StatusPill,
  Input,
} from "@/components/ui";

type BoardEntry = {
  rank: number;
  playerId: string;
  displayName: string;
  teamName: string | null;
  playingHandicap: number;
  totalPoints: number;
  totalGross: number;
  totalNet: number;
  holesCompleted: number;
  isComplete: boolean;
  lastUpdate: string | null;
  lastHoleNumber: number | null;
};

type Player = {
  id: string;
  displayName: string;
  playingHandicap: number;
};

function TeamCreateForm({
  roundId,
  onCreated,
}: {
  roundId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create team");
      setName("");
      onCreated();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create team");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={createTeam} className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[180px] flex-1">
        <Input
          label="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fourball 1"
          required
        />
      </div>
      <Button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "Create team"}
      </Button>
      {err && <p className="w-full text-sm text-red-700">{err}</p>}
    </form>
  );
}

export default function LeaderboardPage() {

  const params = useParams();
  const router = useRouter();
  const roundId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [teeName, setTeeName] = useState("");
  const [status, setStatus] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeActive, setJoinCodeActive] = useState(true);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<
    Array<{
      rank: number;
      teamId: string;
      teamName: string;
      totalPoints: number;
      totalNet: number;
      totalGross?: number;
      playerCount: number;
      memberNames?: string[];
      mode?: string;
    }>
  >([])
  const [teamScoring, setTeamScoring] = useState("aggregate");
  const [connection, setConnection] = useState("Live");
  const [shareCopied, setShareCopied] = useState<"link" | "code" | null>(null);

  // Host correction form
  const [correctPlayerId, setCorrectPlayerId] = useState("");
  const [correctHole, setCorrectHole] = useState(1);
  const [correctScore, setCorrectScore] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/leaderboard`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load leaderboard");
      setCourseName(data.round.courseName);
      setTeeName(data.round.teeName);
      setStatus(data.round.status);
      setJoinCode(data.round.joinCode);
      setJoinCodeActive(data.round.joinCodeActive);
      setBoard(data.leaderboard || []);
      setIsHost(Boolean(data.isHost));
      setPlayers(data.players || []);
      setTeams(data.teams || []);
      setTeamScoring(data.round?.teamScoring || "aggregate");
      if (!correctPlayerId && data.players?.length) {
        setCorrectPlayerId(data.players[0].id);
      }
      setConnection("Live");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setConnection("Error");
    } finally {
      setLoading(false);
    }
  }, [roundId, correctPlayerId]);

  useEffect(() => {
    load();
    let es: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    try {
      es = new EventSource(`/api/rounds/${roundId}/stream`);
      es.onmessage = () => {
        setConnection("Live");
        void load();
      };
      es.onerror = () => {
        setConnection("Polling");
        es?.close();
        es = null;
        if (!fallback) fallback = setInterval(() => void load(), 10000);
      };
    } catch {
      fallback = setInterval(() => void load(), 10000);
    }
    return () => {
      es?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [load, roundId]);

  async function setRoundStatus(next: string) {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status update failed");
      setStatus(data.round.status);
      setMessage(`Status set to ${data.round.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  }

  async function revokeJoinCode() {
    setMessage(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, joinCodeActive: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revoke failed");
      setJoinCodeActive(false);
      setMessage("Join code revoked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  async function saveCorrection() {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: correctPlayerId,
          holeNumber: Number(correctHole),
          grossScore: Number(correctScore),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Correction failed");
      setMessage("Correction saved");
      setCorrectScore("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    }
  }

  async function downloadExport() {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/export`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fairway-live-${courseName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }


  function joinPath() {
    return `/join/${joinCode}`;
  }

  function joinUrl() {
    if (typeof window === "undefined") return joinPath();
    return `${window.location.origin}${joinPath()}`;
  }

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl());
      setShareCopied("link");
      setMessage("Join link copied to clipboard");
      setTimeout(() => setShareCopied(null), 2000);
    } catch {
      setError("Could not copy link — select and copy it manually.");
    }
  }

  async function copyJoinCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setShareCopied("code");
      setMessage("Join code copied");
      setTimeout(() => setShareCopied(null), 2000);
    } catch {
      setError("Could not copy code.");
    }
  }

  async function copyInviteMessage() {
    const url = joinUrl();
    const msg = `Join our Fairway Live round at ${courseName}.\nLink: ${url}\nOr enter code: ${joinCode}`;
    try {
      await navigator.clipboard.writeText(msg);
      setMessage("Invite message copied");
    } catch {
      setError("Could not copy message.");
    }
  }

  const incomplete = board.filter((e) => !e.isComplete);

  if (loading) {
    return (
      <PageShell width="lg">
        <p className="text-sm text-stone-500">Loading leaderboard…</p>
      </PageShell>
    );
  }

  return (
    <PageShell width="lg">
      <Topbar
        backHref="/dashboard"
        backLabel="Dashboard"
        actions={
          <StatusPill tone={connection === "Live" ? "success" : "warning"}>
            {connection}
          </StatusPill>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            Live leaderboard
          </p>
          <h1 className="mt-1 text-2xl font-bold text-emerald-950">
            {courseName}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {teeName} · Code{" "}
            <strong className="tracking-wider">{joinCode}</strong>
            {!joinCodeActive && (
              <span className="ml-2 text-amber-800">(revoked)</span>
            )}
          </p>
        </div>
        <StatusPill
          tone={
            status === "active"
              ? "success"
              : status === "ready_for_export"
                ? "warning"
                : "muted"
          }
        >
          {status}
        </StatusPill>
      </div>


      <Card className="mt-6">
        <h2 className="font-semibold text-emerald-950">Invite players</h2>
        <p className="mt-1 text-sm text-stone-600">
          Share the link so players land on join with the code filled in. The
          code alone still works as a backup.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm break-all flex-1 min-w-[200px]">
            {typeof window !== "undefined" ? `${window.location.origin}/join/${joinCode}` : `/join/${joinCode}`}
          </div>
          {joinCode && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/join/${joinCode}` : `/join/${joinCode}`)}`}
              width={140}
              height={140}
              alt="QR code to join this round"
              className="rounded-lg border border-stone-200 bg-white p-1"
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void copyJoinLink()}>
            {shareCopied === "link" ? "Copied link" : "Copy join link"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyJoinCode()}>
            {shareCopied === "code" ? "Copied code" : `Copy code (${joinCode})`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyInviteMessage()}>
            Copy invite message
          </Button>
          {!isHost && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/rounds/${roundId}/score`)}
            >
              Enter scores
            </Button>
          )}
          {isHost && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/rounds/${roundId}/score`)}
            >
              Enter my scores
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      {message && (
        <Alert tone="success" className="mt-4">
          {message}
        </Alert>
      )}

      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="bg-emerald-900 text-white">
                <th className="px-4 py-3 font-semibold">Rank</th>
                <th className="px-4 py-3 font-semibold">Player</th>
                <th className="px-4 py-3 font-semibold">Team</th>
                <th className="px-4 py-3 font-semibold">Hcp</th>
                <th className="px-4 py-3 font-semibold">Holes</th>
                <th className="px-4 py-3 font-semibold">Gross</th>
                <th className="px-4 py-3 font-semibold">Nett</th>
                <th className="px-4 py-3 font-semibold">Pts</th>
                <th className="px-4 py-3 font-semibold">Last hole</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {board.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-stone-500"
                  >
                    No scores yet. Players haven&apos;t started entering scores.
                  </td>
                </tr>
              ) : (
                board.map((row) => (
                  <tr
                    key={row.playerId}
                    className="border-b border-stone-100 hover:bg-emerald-50/50"
                  >
                    <td className="px-4 py-3 font-bold text-emerald-800">
                      {row.rank}
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900">
                      {row.displayName}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {row.teamName || "—"}
                    </td>
                    <td className="px-4 py-3">{row.playingHandicap}</td>
                    <td className="px-4 py-3">
                      {row.isComplete ? (
                        <StatusPill tone="success">Complete</StatusPill>
                      ) : (
                        `${row.holesCompleted}/18`
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.holesCompleted > 0 ? row.totalGross : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.holesCompleted > 0 ? row.totalNet : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-900 tabular-nums">
                      {row.totalPoints}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.lastHoleNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {row.lastUpdate
                        ? new Date(row.lastUpdate).toLocaleTimeString()
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>


      {teams.length > 0 && (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
            <h2 className="font-semibold text-emerald-950">Team standings</h2>
            <p className="text-xs text-stone-500">
              {teamScoring === "better_ball"
                ? "Fourball better-ball — best member score counts on each hole"
                : "Society / pairs total — all member scores added together"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="bg-emerald-800 text-white">
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Team</th>
                  <th className="px-4 py-3 font-semibold">Players</th>
                  <th className="px-4 py-3 font-semibold">Gross</th>
                  <th className="px-4 py-3 font-semibold">Nett</th>
                  <th className="px-4 py-3 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr
                    key={t.teamId}
                    className="border-b border-stone-100 hover:bg-emerald-50/50"
                  >
                    <td className="px-4 py-3 font-bold text-emerald-800">
                      {t.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">{t.teamName}</div>
                      {t.memberNames && t.memberNames.length > 0 && (
                        <div className="text-xs text-stone-500">
                          {t.memberNames.join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{t.playerCount}</td>
                    <td className="px-4 py-3 tabular-nums">{t.totalGross ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{t.totalNet}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-900 tabular-nums">
                      {t.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => router.push(`/rounds/${roundId}/score`)}
        >
          Score entry
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push(`/rounds/${roundId}/scorecard`)}
        >
          My scorecard
        </Button>
        <Button variant="quiet" onClick={load}>
          Refresh
        </Button>
      </div>

      {isHost && (
        <Card className="mt-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-emerald-950">
              Host controls
            </h2>
            {incomplete.length > 0 && (
              <Alert tone="warning" className="mt-3">
                {incomplete.length} player(s) still have missing holes:{" "}
                {incomplete.map((p) => p.displayName).join(", ")}
              </Alert>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={status !== "setup"}
              onClick={() => setRoundStatus("active")}
            >
              Mark active
            </Button>
            <Button
              variant="secondary"
              disabled={status === "closed" || status === "archived"}
              onClick={() => setRoundStatus("ready_for_export")}
            >
              Ready for export
            </Button>
            <Button
              variant="secondary"
              disabled={status === "closed" || status === "archived"}
              onClick={() => setRoundStatus("closed")}
            >
              Close round
            </Button>
            <Button
              variant="secondary"
              disabled={status !== "closed" && status !== "ready_for_export"}
              onClick={() => setRoundStatus("active")}
            >
              Reopen
            </Button>
            <Button
              variant="quiet"
              disabled={!joinCodeActive}
              onClick={revokeJoinCode}
            >
              Revoke join code
            </Button>
            <Button
              disabled={
                status !== "ready_for_export" && status !== "closed"
              }
              onClick={downloadExport}
            >
              Download Excel
            </Button>
          </div>

          <div className="border-t border-stone-200 pt-6">
            <h3 className="font-semibold text-emerald-950">Teams</h3>
            <p className="mt-1 text-sm text-stone-600">
              Players join with a team name, or create one here for pairs /
              fourballs / society groups.
            </p>
            <TeamCreateForm roundId={roundId} onCreated={() => void load()} />
          </div>

          <div className="border-t border-stone-200 pt-6">
            <h3 className="font-semibold text-emerald-950">Correct a score</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-stone-700">
                Player
                <select
                  value={correctPlayerId}
                  onChange={(e) => setCorrectPlayerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Hole
                <select
                  value={correctHole}
                  onChange={(e) => setCorrectHole(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
                >
                  {Array.from({ length: 18 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Hole {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Gross score"
                type="number"
                min={1}
                max={20}
                value={correctScore}
                onChange={(e) => setCorrectScore(e.target.value)}
              />
            </div>
            <Button
              className="mt-3"
              onClick={saveCorrection}
              disabled={
                status === "closed" ||
                status === "archived" ||
                !correctPlayerId ||
                !correctScore
              }
            >
              Save correction
            </Button>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
