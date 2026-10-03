"use client";

import { useEffect, useRef, useState } from "react";
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
import { enqueueScore } from "@/lib/offline-queue";

type Hole = {
  number: number;
  par: number;
  strokeIndex: number;
  distance?: number | null;
};

type ScoreRow = {
  holeNumber: number;
  grossScore: number;
  version: number;
};

function handicapStrokes(hcp: number, si: number) {
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
}

function stableford(par: number, strokes: number, gross: number) {
  return Math.max(0, 2 + par - (gross - strokes));
}

export default function ScoreEntryPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [scores, setScores] = useState<Record<number, ScoreRow>>({});
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  const [handicap, setHandicap] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [status, setStatus] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [needsHostJoin, setNeedsHostJoin] = useState(false);
  const [hostJoinName, setHostJoinName] = useState("Host");
  const [hostJoinHcp, setHostJoinHcp] = useState(0);
  const [currentHole, setCurrentHole] = useState(1);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);

  const closed = status === "closed" || status === "archived";

  async function loadRoundForPlayer(player: {
    playerId: string;
    displayName: string;
    playingHandicap: number;
  }) {
    setPlayerId(player.playerId);
    setDisplayName(player.displayName);
    setHandicap(player.playingHandicap);

    const res = await fetch(`/api/rounds/${roundId}/leaderboard`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load round");

    setCourseName(data.round.courseName);
    setStatus(data.round.status);
    setIsHost(Boolean(data.isHost));

    const holeList: Hole[] = data.holes || [];
    if (holeList.length === 18) setHoles(holeList);

    const map: Record<number, ScoreRow> = {};
    if (Array.isArray(data.myScores)) {
      for (const s of data.myScores) {
        map[s.holeNumber] = {
          holeNumber: s.holeNumber,
          grossScore: s.grossScore,
          version: s.version ?? 1,
        };
      }
    }
    setScores(map);

    let start = 1;
    for (let i = 1; i <= 18; i++) {
      if (!map[i]) {
        start = i;
        break;
      }
    }
    setCurrentHole(start);
    if (map[start]) {
      setInputValue(String(map[start].grossScore));
    } else {
      const startHole = (holeList.length === 18 ? holeList : []).find(
        (h: { number: number; par: number }) => h.number === start
      );
      setInputValue(String(startHole?.par ?? 4));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        const player = sessionData.player;
        const host = sessionData.host;

        if (player && player.roundId === roundId) {
          if (!cancelled) {
            setNeedsHostJoin(false);
            await loadRoundForPlayer(player);
          }
          return;
        }

        if (host) {
          // Host of this round can register as a player
          const lbRes = await fetch(`/api/rounds/${roundId}/leaderboard`);
          const lb = await lbRes.json();
          if (lbRes.ok && lb.isHost) {
            if (!cancelled) {
              setIsHost(true);
              setCourseName(lb.round?.courseName || "");
              setStatus(lb.round?.status || "");
              setHostJoinName(host.displayName || host.email?.split("@")[0] || "Host");
              setNeedsHostJoin(true);
              if (lb.holes?.length === 18) setHoles(lb.holes);
            }
            return;
          }
        }

        if (!cancelled) router.push(`/join?joinCode=`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, router]);

  async function joinAsHostPlayer(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/join-as-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: hostJoinName,
          playingHandicap: Number(hostJoinHcp),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join as player");
      setNeedsHostJoin(false);
      await loadRoundForPlayer({
        playerId: data.player.id,
        displayName: data.player.displayName,
        playingHandicap: data.player.playingHandicap,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setSaving(false);
    }
  }

  function parForHole(n: number): number {
    const list =
      holes.length === 18
        ? holes
        : Array.from({ length: 18 }, (_, i) => ({
            number: i + 1,
            par: 4,
            strokeIndex: i + 1,
          }));
    return list.find((h) => h.number === n)?.par ?? 4;
  }

  function goToHole(n: number) {
    setCurrentHole(n);
    const existing = scoresRef.current[n];
    setInputValue(
      existing ? String(existing.grossScore) : String(parForHole(n))
    );
    setMessage(null);
    setError(null);
  }

  function messageForSaveFailure(
    httpStatus: number,
    data: { error?: string; serverScore?: number; serverVersion?: number }
  ): string {
    if (httpStatus === 401) {
      return "Your session expired. Join the round again, then retry.";
    }
    if (httpStatus === 403) {
      return data.error || "You cannot change scores on this round.";
    }
    if (httpStatus === 404) {
      return "Round or player was not found.";
    }
    if (httpStatus === 409) {
      return `This hole was updated elsewhere (server score: ${data.serverScore}). Adjust and save again.`;
    }
    if (httpStatus === 429) {
      return "Too many saves. Wait a moment, then try again.";
    }
    if (httpStatus >= 500) {
      return "Server error — score was not saved. Try again.";
    }
    return data.error || `Could not save score (error ${httpStatus}).`;
  }

  async function saveScore(opts?: {
    holeNumber?: number;
    grossScore?: number;
  }): Promise<boolean> {
    if (!playerId) {
      setError("You are not registered as a player on this round yet.");
      return false;
    }
    if (closed) {
      setError("This round is closed. Scores can no longer be changed.");
      return false;
    }

    const holeNumber = opts?.holeNumber ?? currentHole;
    const raw =
      opts?.grossScore !== undefined ? opts.grossScore : Number(inputValue);

    if (
      (opts?.grossScore === undefined && inputValue === "") ||
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > 20
    ) {
      setError("Enter a whole number score from 1 to 20 before saving.");
      return false;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You appear offline. Reconnect and save again.");
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const existing = scoresRef.current[holeNumber];
      let res: Response;
      try {
        res = await fetch(`/api/rounds/${roundId}/scores`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holeNumber,
            grossScore: raw,
            clientVersion: existing?.version,
            playerId,
          }),
        });
      } catch {
        if (playerId) {
          enqueueScore(roundId, playerId, {
            holeNumber,
            grossScore: raw,
            clientVersion: existing?.version,
          });
          setScores((prev) => {
            const next = {
              ...prev,
              [holeNumber]: {
                holeNumber,
                grossScore: raw,
                version: existing?.version ?? 0,
              },
            };
            scoresRef.current = next;
            return next;
          });
          setMessage(
            `Saved offline (queued). Will sync when you are back online.`
          );
          setError(null);
          return true;
        }
        setError("Network error — score was not saved. Check your connection.");
        return false;
      }

      let data: {
        error?: string;
        serverScore?: number;
        serverVersion?: number;
        score?: { grossScore: number; version: number; points: number };
      } = {};
      try {
        data = await res.json();
      } catch {
        if (!res.ok) {
          setError(`Could not save score (HTTP ${res.status}).`);
          return false;
        }
      }

      if (res.status === 409) {
        if (
          typeof data.serverScore === "number" &&
          typeof data.serverVersion === "number"
        ) {
          setScores((prev) => ({
            ...prev,
            [holeNumber]: {
              holeNumber,
              grossScore: data.serverScore!,
              version: data.serverVersion!,
            },
          }));
          if (holeNumber === currentHole) {
            setInputValue(String(data.serverScore));
          }
        }
        setError(messageForSaveFailure(409, data));
        setMessage(null);
        return false;
      }

      if (!res.ok || !data.score) {
        setError(messageForSaveFailure(res.status, data));
        setMessage(null);
        return false;
      }

      const nextRow = {
        holeNumber,
        grossScore: data.score.grossScore,
        version: data.score.version,
      };
      setScores((prev) => {
        const next = { ...prev, [holeNumber]: nextRow };
        scoresRef.current = next;
        return next;
      });
      setMessage(
        `Hole ${holeNumber} saved · ${data.score.points} Stableford points`
      );
      setError(null);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? `Save failed: ${err.message}`
          : "Save failed unexpectedly."
      );
      setMessage(null);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    if (closed) {
      if (currentHole < 18) goToHole(currentHole + 1);
      return;
    }

    const value = Number(inputValue);
    const hasValidScore =
      inputValue !== "" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 20;

    if (hasValidScore) {
      const existing = scoresRef.current[currentHole];
      const unchanged = existing && existing.grossScore === value;
      if (!unchanged) {
        const ok = await saveScore({
          holeNumber: currentHole,
          grossScore: value,
        });
        if (!ok) return;
      }
    } else if (inputValue !== "") {
      setError("Enter a whole number from 1 to 20 before moving on.");
      return;
    }

    if (currentHole < 18) goToHole(currentHole + 1);
  }

  async function retrySave() {
    await saveScore({ holeNumber: currentHole });
  }

  const activeHoles =
    holes.length === 18
      ? holes
      : Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          par: 4,
          strokeIndex: i + 1,
        }));

  const hole =
    activeHoles.find((h) => h.number === currentHole) || activeHoles[0];
  const strokes = handicapStrokes(handicap, hole.strokeIndex);
  const grossNum = inputValue === "" ? null : Number(inputValue);
  const previewPoints =
    grossNum !== null &&
    Number.isInteger(grossNum) &&
    grossNum >= 1 &&
    grossNum <= 20
      ? stableford(hole.par, strokes, grossNum)
      : null;

  const completed = Object.keys(scores).length;
  const totalPoints = activeHoles.reduce((sum, h) => {
    const s = scores[h.number];
    if (!s) return sum;
    return (
      sum +
      stableford(h.par, handicapStrokes(handicap, h.strokeIndex), s.grossScore)
    );
  }, 0);

  if (loading) {
    return (
      <PageShell width="md">
        <p className="text-sm text-stone-500">Loading scorecard…</p>
      </PageShell>
    );
  }

  if (needsHostJoin) {
    return (
      <PageShell width="sm">
        <Topbar backHref={`/rounds/${roundId}/leaderboard`} backLabel="Leaderboard" />
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
          Host scoring
        </p>
        <h1 className="mt-1 text-2xl font-bold text-emerald-950">
          Enter your scores
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Add yourself as a player on <strong>{courseName || "this round"}</strong>{" "}
          so you can enter hole scores like everyone else.
        </p>
        <form onSubmit={joinAsHostPlayer} className="mt-8 space-y-4">
          <Input
            label="Your display name"
            required
            value={hostJoinName}
            onChange={(e) => setHostJoinName(e.target.value)}
          />
          <Input
            label="Playing handicap"
            type="number"
            min={0}
            max={54}
            required
            value={hostJoinHcp}
            onChange={(e) => setHostJoinHcp(Number(e.target.value))}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" fullWidth disabled={saving}>
            {saving ? "Joining…" : "Start scoring"}
          </Button>
        </form>
      </PageShell>
    );
  }

  return (
    <PageShell width="md">
      <Topbar
        backHref="/dashboard"
        backLabel="Dashboard"
        actions={
          <Button
            variant="quiet"
            onClick={() => router.push(`/rounds/${roundId}/leaderboard`)}
          >
            Leaderboard
          </Button>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            Score entry{isHost ? " · Host" : ""}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-emerald-950">
            {courseName || "Round"}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {displayName} · Hcp {handicap}
          </p>
        </div>
        <StatusPill tone={closed ? "muted" : "success"}>
          {status || "active"}
        </StatusPill>
      </div>

      {closed && (
        <Alert tone="warning" className="mt-4">
          This round is closed. Scores can no longer be changed.
        </Alert>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-950">
            Hole {hole.number}
          </h2>
          <StatusPill>
            {scores[currentHole] ? "Saved" : "Ready to score"}
          </StatusPill>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-emerald-50 p-3 text-sm">
          <div>
            <dt className="text-stone-500">Par</dt>
            <dd className="font-semibold text-emerald-950">{hole.par}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Stroke index</dt>
            <dd className="font-semibold text-emerald-950">{hole.strokeIndex}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Hcp strokes</dt>
            <dd className="font-semibold text-emerald-950">{strokes}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              className="h-14 w-14 rounded-full text-2xl"
              onClick={() => {
                const base =
                  inputValue === "" ? hole.par : Number(inputValue) || hole.par;
                setInputValue(String(Math.max(1, base - 1)));
              }}
              disabled={closed || saving}
              aria-label="Decrease score"
            >
              −
            </Button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={closed || saving}
              className="h-16 w-24 rounded-xl border-2 border-stone-300 text-center text-3xl font-bold text-emerald-950 focus:border-emerald-700 focus:outline-none"
              placeholder={String(hole.par)}
              aria-label="Gross score"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-14 w-14 rounded-full text-2xl"
              onClick={() => {
                const base =
                  inputValue === "" ? hole.par : Number(inputValue) || hole.par;
                setInputValue(String(Math.min(20, base + 1)));
              }}
              disabled={closed || saving}
              aria-label="Increase score"
            >
              +
            </Button>
          </div>
          {grossNum !== null &&
            Number.isInteger(grossNum) &&
            grossNum >= 1 &&
            grossNum <= 20 && (
              <p
                className={`text-sm font-semibold tabular-nums ${
                  grossNum < hole.par
                    ? "text-emerald-700"
                    : grossNum > hole.par
                      ? "text-amber-700"
                      : "text-stone-600"
                }`}
              >
                {grossNum === hole.par
                  ? "Par (E)"
                  : grossNum < hole.par
                    ? `${grossNum - hole.par} vs par`
                    : `+${grossNum - hole.par} vs par`}
              </p>
            )}
        </div>

        {previewPoints !== null && (
          <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">Nett score</span>
              <strong>{grossNum! - strokes}</strong>
            </div>
            <div className="mt-1 flex justify-between border-t border-stone-200 pt-1">
              <span className="text-stone-500">Stableford points</span>
              <strong className="text-emerald-800">{previewPoints}</strong>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            disabled={currentHole <= 1 || saving}
            onClick={() => goToHole(currentHole - 1)}
          >
            ← Prev
          </Button>
          <Button
            onClick={() => void saveScore()}
            disabled={saving || closed}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="secondary"
            disabled={currentHole >= 18 || saving}
            onClick={() => void goNext()}
          >
            {saving ? "Saving…" : "Next →"}
          </Button>
        </div>

        {error && (
          <Alert tone="error" className="mt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p>{error}</p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="border-red-300 bg-white text-red-900 hover:bg-red-50"
                  disabled={saving || closed}
                  onClick={() => void retrySave()}
                >
                  {saving ? "Retrying…" : "Retry save"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  className="text-red-800"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </Alert>
        )}
        {message && !error && (
          <Alert tone="success" className="mt-4">
            {message}
          </Alert>
        )}
      </Card>

      <Card className="mt-4">
        <h3 className="font-semibold text-emerald-950">Hole progress</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeHoles.map((h) => {
            const scored = Boolean(scores[h.number]);
            const current = h.number === currentHole;
            return (
              <button
                key={h.number}
                type="button"
                onClick={() => goToHole(h.number)}
                className={`min-h-10 min-w-10 rounded-lg border px-2 py-1 text-sm font-semibold ${
                  current
                    ? "border-emerald-700 outline outline-2 outline-emerald-700"
                    : "border-stone-200"
                } ${
                  scored
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-white text-stone-700"
                }`}
              >
                {h.number}
                {scored ? ` · ${scores[h.number].grossScore}` : ""}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-stone-600">
            Holes completed: <strong>{completed} / 18</strong>
          </span>
          <span className="font-semibold text-emerald-800">{totalPoints} pts</span>
        </div>
      </Card>
    </PageShell>
  );
}
