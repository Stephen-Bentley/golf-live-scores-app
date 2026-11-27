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
import { findQueuedScore, loadQueue } from "@/lib/offline-queue";
import { useOfflineScores } from "@/lib/use-offline-scores";
import { PendingScores } from "@/components/PendingScores";
import { inTeeOrder } from "@/domain/fourball";
import {
  COUNTBACK_DESCRIPTION, STABLEFORD_COUNTBACK, getAllianceMulligans, getCompetitionHandicap, getHandicapStrokes, getHolePoints, getPlayerSummary,
  type Hole, type ScoringFormat, type TeamScoringMode,
} from "@/domain/scoring";
import { FourballScoring, type PlayerScore, type ScoreRow, type ScoringGroup } from "@/components/FourballScoring";
import { SippyCupRules } from "@/components/SippyCupRules";
import { ScrambleScoring } from "@/components/ScrambleScoring";
import type { ScrambleStanding } from "@/domain/scramble";

export default function ScoreEntryPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [format, setFormat] = useState<ScoringFormat>("stableford");
  const [teamScoring, setTeamScoring] = useState<TeamScoringMode>("aggregate");
  const [scoringGroup, setScoringGroup] = useState<ScoringGroup | null>(null);
  const [scrambleTeams, setScrambleTeams] = useState<ScrambleStanding[]>([]);
  const [scrambleId, setScrambleId] = useState("");
  const [scoreMode, setScoreMode] = useState<"self" | "fourball">("self");
  const [scores, setScores] = useState<Record<number, ScoreRow>>({});
  const scoresRef = useRef(scores);
  const refreshSequence = useRef(0);
  scoresRef.current = scores;

  const [handicap, setHandicap] = useState(0);
  const [actorId, setActorId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [useCountback, setUseCountback] = useState(false);
  const [status, setStatus] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [needsHostJoin, setNeedsHostJoin] = useState(false);
  const [hostJoinName, setHostJoinName] = useState("Host");
  const [hostJoinHcp, setHostJoinHcp] = useState(0);
  const [currentHole, setCurrentHole] = useState(1);
  const currentHoleRef = useRef(currentHole);
  currentHoleRef.current = currentHole;
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);

  const offline = useOfflineScores(roundId, actorId, (kind, synced) => {
    if (kind === "scramble") {
      void refreshScorecard().catch(() => setError("Scores reached the server. Refresh to see the latest team scorecard."));
      return;
    }

    const saved = synced.map(({ targetId, ...score }) => ({ ...score, playerId: targetId }));
    applySavedScores(saved);
    const own = saved.find((score) => score.playerId === playerId && score.holeNumber === currentHole);
    if (own && own.version >= (scoresRef.current[own.holeNumber]?.version ?? 0)) setInputValue(String(own.grossScore));
  }, refreshScorecard);
  const currentPending = playerId ? findQueuedScore(offline.queue, currentHole, playerId) : undefined;
  const pendingGross = currentPending?.scores.find(({ targetId }) => targetId === playerId)?.grossScore;
  const pendingScores = (
    <PendingScores {...offline} nameFor={(id) => displayName && id === playerId ? displayName
      : scoringGroup?.players.find(({ id: memberId }) => memberId === id)?.displayName
        ?? scrambleTeams.find(({ teamId }) => teamId === id)?.teamName ?? "Score"} />
  );

  const closed = status === "closed" || status === "archived";

  function loadScramble(data: {
    scramble?: ScrambleStanding[];
    myScrambleId?: string;
    isHost: boolean;
    holes: Hole[];
    round: { status: string; scoringFormat: ScoringFormat };
  }) {
    const teams = data.isHost ? data.scramble ?? [] : (data.scramble ?? []).filter((team) => team.teamId === data.myScrambleId);
    setScrambleTeams(teams);
    setScrambleId((current) => teams.some((team) => team.teamId === current)
      ? current
      : data.myScrambleId ?? teams[0]?.teamId ?? "");
    setHoles(data.holes);
    setStatus(data.round.status);
    setFormat(data.round.scoringFormat);
  }

  async function refreshScorecard() {
    const sequence = ++refreshSequence.current;
    const response = await fetch(`/api/rounds/${roundId}/leaderboard`);
    const data = await response.json();
    if (sequence !== refreshSequence.current) return;
    if (!response.ok) throw new Error(data.error || "Could not refresh the scorecard.");
    if (data.round.teamScoring === "american_scramble") {
      loadScramble(data);
    } else if (playerId) {
      const group = data.scoringGroup as ScoringGroup | null;
      const own: ScoreRow[] = data.myScores ?? [];
      const updated = group
        ? group.players.flatMap((member) => member.scores.map((score) => ({ ...score, playerId: member.id })))
        : own.map((score) => ({ ...score, playerId }));
      const activeHole = currentHoleRef.current;
      const current = own.find((score) => score.holeNumber === activeHole);
      const previous = scoresRef.current[activeHole];
      if (current && current.version > (previous?.version ?? 0)) {
        const previousValue = String(previous?.grossScore ?? parForHole(activeHole));
        setInputValue((draft) => currentHoleRef.current === activeHole && draft === previousValue
          ? String(current.grossScore) : draft);
      }
      applySavedScores(updated);
    }
  }

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
    setUseCountback(data.round.stablefordCountback === STABLEFORD_COUNTBACK);
    setStatus(data.round.status);
    setIsHost(Boolean(data.isHost));

    setFormat(data.round.scoringFormat);
    setTeamScoring(data.round.teamScoring);
    if (data.round.teamScoring === "american_scramble") {
      loadScramble(data);
      setActorId(player.playerId);
      return;
    }
    setScoringGroup(data.scoringGroup ?? null);
    setScoreMode("self");
    const holeList = inTeeOrder<Hole>(data.holes ?? [], data.scoringGroup?.startingHole ?? 1);
    setHoles(holeList);

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
    setActorId(player.playerId);

    const pending = loadQueue(roundId, player.playerId);
    const start = holeList.find((h) => !map[h.number] && !findQueuedScore(pending, h.number, player.playerId)) ?? holeList[0];
    if (start) {
      setCurrentHole(start.number);
      setInputValue(String(map[start.number]?.grossScore ?? start.par));
    }
  }

  useEffect(() => {
    let cancelled = false;
    let retryAfterReconnect = false;
    let loadingRound = false;
    const boot = async () => {
      if (loadingRound) return;
      loadingRound = true;
      retryAfterReconnect = false;
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
              if (lb.round.teamScoring === "american_scramble") {
                setTeamScoring("american_scramble");
                setActorId(host.userId);
                setNeedsHostJoin(false);
                loadScramble(lb);
                return;
              }
              setHostJoinName(host.displayName || host.email?.split("@")[0] || "Host");
              setNeedsHostJoin(true);
              if (lb.holes?.length) setHoles(lb.holes);
            }
            return;
          }
        }

        if (!cancelled) router.push(`/join?joinCode=`);
      } catch (err) {
        if (!cancelled) {
          retryAfterReconnect = true;
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        loadingRound = false;
        if (!cancelled) setLoading(false);
      }
    };
    const reconnect = () => { if (retryAfterReconnect) void boot(); };
    void boot();
    window.addEventListener("online", reconnect);
    return () => {
      cancelled = true;
      window.removeEventListener("online", reconnect);
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
    return holes.find((h) => h.number === n)?.par ?? 4;
  }

  function applySavedScores(saved: PlayerScore[]) {
    setScoringGroup((previous) => previous && ({
      ...previous,
      players: previous.players.map((member) => {
        const updates = saved.filter((score) => score.playerId === member.id && !member.scores.some((previous) =>
          previous.holeNumber === score.holeNumber && previous.version > score.version
        ));
        if (!updates.length) return member;
        return {
          ...member,
          scores: [...member.scores.filter((score) =>
            !updates.some((update) => update.holeNumber === score.holeNumber)
          ), ...updates],
        };
      }),
    }));
    const ownUpdates = saved.filter((score) => score.playerId === playerId);
    if (ownUpdates.length) {
      setScores((previous) => {
        const next = { ...previous };
        for (const score of ownUpdates) {
          if (score.version >= (next[score.holeNumber]?.version ?? 0)) next[score.holeNumber] = score;
        }
        scoresRef.current = next;
        return next;
      });
    }
  }

  function goToHole(n: number) {
    currentHoleRef.current = n;
    setCurrentHole(n);
    const existing = scoresRef.current[n];
    setInputValue(
      existing ? String(existing.grossScore) : String(parForHole(n))
    );
    setMessage(null);
    setError(null);
  }

  async function saveScore(opts?: { holeNumber?: number; grossScore?: number }): Promise<boolean> {
    if (!playerId || closed) return false;
    const holeNumber = opts?.holeNumber ?? currentHole;
    const raw = opts?.grossScore ?? Number(inputValue);
    if (!Number.isInteger(raw) || raw < 1 || raw > 20) {
      setError("Enter a whole number score from 1 to 20 before saving.");
      return false;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await offline.submit({
        kind: "player", holeNumber,
        scores: [{ targetId: playerId, grossScore: raw, clientVersion: scoresRef.current[holeNumber]?.version ?? 0 }],
      });
      if (result.status === "saved") {
        const points = result.scores[0].points;
        setMessage(format === "stroke" ? `Hole ${holeNumber} saved` : `Hole ${holeNumber} saved · ${points} points`);
      }
      if (result.status === "failed") setError(result.error);
      return result.status === "saved" || result.status === "pending";
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    if (nextHole === undefined) return;
    if (closed || currentPending) {
      goToHole(nextHole);
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

    goToHole(nextHole);
  }

  async function retrySave() {
    await saveScore({ holeNumber: currentHole });
  }

  const activeHoles =
    holes.length
      ? holes
      : Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          par: 4,
          strokeIndex: i + 1,
        }));

  const hole =
    activeHoles.find((h) => h.number === currentHole) || activeHoles[0];
  const holeIndex = activeHoles.indexOf(hole);
  const previousHole = activeHoles[holeIndex - 1]?.number;
  const nextHole = activeHoles[holeIndex + 1]?.number;
  const scoringHandicap = getCompetitionHandicap(handicap, teamScoring);
  const mulligans = teamScoring === "fourball_alliance" ? getAllianceMulligans(handicap) : 0;
  const strokes = getHandicapStrokes(scoringHandicap, hole.strokeIndex, activeHoles.length);
  const visibleInput = pendingGross === undefined ? inputValue : String(pendingGross);
  const grossNum = visibleInput === "" ? null : Number(visibleInput);
  const previewPoints =
    grossNum !== null &&
    Number.isInteger(grossNum) &&
    grossNum >= 1 &&
    grossNum <= 20
      ? getHolePoints(format, hole.par, strokes, grossNum)
      : null;

  const { totalPoints, totalNet, holesCompleted } = getPlayerSummary(activeHoles, handicap, Object.values(scores), { format, teamScoring });

  if (loading) {
    return (
      <PageShell width="md">
        <p className="text-sm text-stone-500">Loading scorecard…</p>
      </PageShell>
    );
  }

  if (teamScoring === "american_scramble") {
    const team = scrambleTeams.find((team) => team.teamId === scrambleId);
    return (
      <PageShell width="md">
        <Topbar backHref={`/rounds/${roundId}/leaderboard`} backLabel="Leaderboard" />
        <h1 className="text-2xl font-bold text-emerald-950">American Scramble</h1>
        <p className="mt-2 text-sm text-stone-600">{courseName} · One shared score per team and hole</p>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {isHost && scrambleTeams.length > 1 && (
          <label className="mt-4 block text-sm font-medium text-stone-700">
            Scramble team
            <select
              value={scrambleId}
              onChange={(event) => setScrambleId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"
            >
              {scrambleTeams.map(({ teamId, teamName }) => <option key={teamId} value={teamId}>{teamName}</option>)}
            </select>
          </label>
        )}
        {pendingScores}
        {team ? (
          <ScrambleScoring key={team.teamId} team={team} holes={holes} format={format} closed={closed} pending={offline.queue} onSubmit={offline.submit} />
        ) : (
          <Alert tone="warning" className="mt-4">
            {isHost ? "Create a fourball and assign its players from the leaderboard." : "Ask the host to assign you to a scramble team."}
          </Alert>
        )}
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
            {displayName} · Hcp {scoringHandicap}
            {mulligans > 0 && ` · ${mulligans} mulligan${mulligans === 1 ? "" : "s"}`}
          </p>
          {useCountback && <p className="mt-2 text-sm text-stone-600">{COUNTBACK_DESCRIPTION}</p>}
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

      {scoringGroup && playerId && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Scoring mode">
          <Button
            variant={scoreMode === "self" ? "primary" : "secondary"}
            aria-pressed={scoreMode === "self"}
            disabled={saving}
            onClick={() => {
              if (scoreMode === "fourball") goToHole(currentHole);
              setScoreMode("self");
            }}
          >
            My score
          </Button>
          <Button
            variant={scoreMode === "fourball" ? "primary" : "secondary"}
            aria-pressed={scoreMode === "fourball"}
            disabled={saving}
            onClick={() => setScoreMode("fourball")}
          >
            Score fourball
          </Button>
        </div>
      )}

      {pendingScores}
      {scoreMode === "fourball" && scoringGroup && playerId && (
        <>
          <p className="mt-3 text-sm font-medium text-stone-600">
            {scoringGroup.name}{scoringGroup.teeTime && ` · ${scoringGroup.teeTime}`}
          </p>
          <FourballScoring
            playerId={playerId}
            group={scoringGroup}
            holes={activeHoles}
            format={format}
            teamScoring={teamScoring}
            closed={closed}
            saving={saving}
            onSavingChange={setSaving}
            pending={offline.queue}
            onSubmit={offline.submit}
          />
        </>
      )}

      <Card className={scoreMode === "fourball" ? "hidden" : "mt-6"}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-950">
            Hole {hole.number}
          </h2>
          <StatusPill>
            {currentPending ? "Pending sync" : scores[currentHole] ? "Saved" : "Ready to score"}
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
        {teamScoring === "fourball_alliance" && <SippyCupRules par={hole.par} />}

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
              disabled={closed || saving || Boolean(currentPending)}
              aria-label="Decrease score"
            >
              −
            </Button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={visibleInput}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={closed || saving || Boolean(currentPending)}
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
              disabled={closed || saving || Boolean(currentPending)}
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
            {format !== "stroke" && (
              <div className="mt-1 flex justify-between border-t border-stone-200 pt-1">
                <span className="text-stone-500">Points</span>
                <strong className="text-emerald-800">{previewPoints}</strong>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            disabled={previousHole === undefined || saving}
            onClick={() => previousHole !== undefined && goToHole(previousHole)}
          >
            ← Prev
          </Button>
          <Button
            onClick={() => void saveScore()}
            disabled={saving || closed || Boolean(currentPending)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="secondary"
            disabled={nextHole === undefined || saving}
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

      <Card className={scoreMode === "fourball" ? "hidden" : "mt-4"}>
        <h3 className="font-semibold text-emerald-950">Hole progress</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeHoles.map((h) => {
            const pending = playerId ? findQueuedScore(offline.queue, h.number, playerId) : undefined;
            const scored = Boolean(scores[h.number]);
            const current = h.number === currentHole;
            return (
              <button
                key={h.number}
                type="button"
                disabled={saving}
                onClick={() => goToHole(h.number)}
                className={`min-h-10 min-w-10 rounded-lg border px-2 py-1 text-sm font-semibold ${
                  current
                    ? "border-emerald-700 outline outline-2 outline-emerald-700"
                    : "border-stone-200"
                } ${
                  pending ? "bg-amber-100 text-amber-950" : scored
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-white text-stone-700"
                }`}
              >
                {h.number}
                {pending ? " · Pending" : scored ? ` · ${scores[h.number].grossScore}` : ""}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-stone-600">
            Holes completed: <strong>{holesCompleted} / {activeHoles.length}</strong>
          </span>
          <span className="font-semibold text-emerald-800">
            {format === "stroke" ? `${totalNet} nett` : `${totalPoints} pts`}
          </span>
        </div>
      </Card>
    </PageShell>
  );
}
