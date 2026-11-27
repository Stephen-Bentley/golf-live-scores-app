"use client";

import { useState, type FormEvent } from "react";
import { inTeeOrder } from "@/domain/fourball";
import type { Hole, ScoringFormat } from "@/domain/scoring";
import type { ScrambleStanding } from "@/domain/scramble";
import { findQueuedScore, type QueuedScore, type ScoreWrite, type SyncResult } from "@/lib/offline-queue";
import { Alert, Button, Card, Input } from "@/components/ui";

type Props = {
  team: ScrambleStanding;
  holes: Hole[];
  format: ScoringFormat;
  closed: boolean;
  pending: QueuedScore[];
  onSubmit: (write: ScoreWrite) => Promise<SyncResult>;
};

export function ScrambleScoring({ team, holes, format, closed, pending, onSubmit }: Props) {
  const ordered = inTeeOrder(holes, team.startingHole);
  const scores = new Map(team.holeScores.map((score) => [score.holeNumber, score]));
  const [holeNumber, setHoleNumber] = useState(() =>
    ordered.find((hole) => !scores.has(hole.number))?.number ?? ordered[0].number
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saved = scores.get(holeNumber);
  const queued = findQueuedScore(pending, holeNumber, team.teamId)?.scores[0];
  const disabled = closed || team.playingHandicap === null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled || !draft || queued) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await onSubmit({
        kind: "scramble", holeNumber,
        scores: [{ targetId: team.teamId, grossScore: Number(draft), clientVersion: saved?.version ?? 0 }],
      });
      if (result.status === "failed") throw new Error(result.error);
      if (result.status === "conflict") {
        setDraft(null);
        return;
      }
      if (result.status === "saved") setMessage(`Hole ${holeNumber} saved.`);
      setDraft(null);
      if (!saved) {
        const next = ordered.find((hole) => hole.number !== holeNumber && !scores.has(hole.number) && !findQueuedScore(pending, hole.number, team.teamId));
        if (next) setHoleNumber(next.number);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the team score.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 space-y-4">
      <div>
        <h2 className="font-semibold text-emerald-950">{team.teamName}</h2>
        <p className="text-sm text-stone-600">{team.memberNames.join(", ")}</p>
        {team.playingHandicap !== null && (
          <p className="text-sm text-stone-600">Team handicap {team.playingHandicap}</p>
        )}
      </div>
      {closed && <Alert tone="warning">This round is closed.</Alert>}
      {team.playingHandicap === null && <Alert tone="warning">Assign two to four players to this team to start scoring.</Alert>}
      {!disabled && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="block text-sm font-medium text-stone-700">
            Hole
            <select
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              value={holeNumber}
              disabled={busy}
              onChange={(event) => {
                setHoleNumber(Number(event.target.value));
                setDraft(null);
                setError("");
                setMessage("");
              }}
            >
              {ordered.map((hole) => <option key={hole.number} value={hole.number}>Hole {hole.number} · Par {hole.par}</option>)}
            </select>
          </label>
          <Input
            label="Team gross strokes"
            type="number"
            min={1}
            max={20}
            required
            disabled={busy || Boolean(queued)}
            value={queued?.grossScore ?? draft ?? saved?.grossScore ?? ""}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={busy || !draft || Boolean(queued)}>{busy ? "Saving…" : "Save team score"}</Button>
        </form>
      )}
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left font-semibold text-emerald-950">Team scorecard</caption>
          <thead>
            <tr className="border-b border-stone-200">
              <th scope="col">Hole</th><th scope="col">Par</th><th scope="col">Gross</th><th scope="col">Nett</th>
              {format !== "stroke" && <th scope="col">Points</th>}
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ number, par }) => {
              const score = scores.get(number);
              return (
                <tr key={number} className="border-b border-stone-100">
                  <th scope="row" className="py-1">{number}</th><td>{par}</td>
                  <td>{score?.grossScore ?? "—"}</td><td>{score?.netScore ?? "—"}</td>
                  {format !== "stroke" && <td>{score?.points ?? "—"}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="py-1">Total ({team.holesCompleted}/{holes.length})</th>
              <td>{team.totalGross}</td><td>{team.totalNet}</td>
              {format !== "stroke" && <td>{team.totalPoints}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
