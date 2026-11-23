"use client";

import { useState } from "react";
import {
  getAllianceMulligans, getCompetitionHandicap, getHandicapStrokes, getHolePoints,
  type Hole, type ScoringFormat, type TeamScoringMode,
} from "@/domain/scoring";
import { Alert, Button, Card, StatusPill } from "@/components/ui";
import { SippyCupRules } from "./SippyCupRules";
import type { Fourball } from "./FourballManager";

export type ScoreRow = { holeNumber: number; grossScore: number; version: number };
export type PlayerScore = ScoreRow & { playerId: string };
export type ScoringGroup = Fourball & {
  players: { id: string; displayName: string; playingHandicap: number; scores: ScoreRow[] }[];
};

type Props = {
  roundId: string;
  playerId: string;
  group: ScoringGroup;
  holes: Hole[];
  format: ScoringFormat;
  teamScoring: TeamScoringMode;
  closed: boolean;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onScoresSaved: (scores: PlayerScore[]) => void;
};

export function FourballScoring({
  roundId, playerId, group, holes, format, teamScoring, closed, saving, onSavingChange, onScoresSaved,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstMissing = holes.findIndex((hole) => group.players.some((player) =>
      !player.scores.some((score) => score.holeNumber === hole.number)
    ));
    return Math.max(0, firstMissing);
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hole = holes[currentIndex];
  const rows = group.players.map((player) => {
    const saved = player.scores.find((score) => score.holeNumber === hole.number);
    const value = drafts[player.id] ?? (saved ? String(saved.grossScore) : "");
    return { ...player, saved, value };
  }).sort((a, b) => Number(b.id === playerId) - Number(a.id === playerId));

  function goTo(index: number) {
    setCurrentIndex(index);
    setDrafts({});
    setError(null);
    setMessage(null);
  }

  async function save(advance: boolean) {
    setError(null);
    setMessage(null);
    const scores = rows.flatMap(({ id, value, saved }) =>
      value !== "" && Number(value) !== saved?.grossScore
        ? [{ playerId: id, grossScore: Number(value), clientVersion: saved?.version ?? 0 }]
        : []
    );
    if (scores.some(({ grossScore }) => !Number.isInteger(grossScore) || grossScore < 1 || grossScore > 20)) {
      setError("Enter a whole number from 1 to 20 for each score.");
      return;
    }
    if (!scores.length) {
      if (advance) goTo(currentIndex + 1);
      return;
    }
    onSavingChange(true);
    try {
      const response = await fetch(`/api/rounds/${roundId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holeNumber: hole.number, scores }),
      });
      const data = await response.json();
      if (response.status === 409 && data.error === "conflict") {
        const player = group.players.find((member) => member.id === data.playerId);
        if (typeof data.serverScore === "number") {
          onScoresSaved([{
            playerId: data.playerId, holeNumber: hole.number,
            grossScore: data.serverScore, version: data.serverVersion,
          }]);
        }
        setDrafts((previous) => ({
          ...previous, [data.playerId]: data.serverScore == null ? "" : String(data.serverScore),
        }));
        setError(`${player?.displayName ?? "A player"}'s score changed on another device. Review the latest score and save again.`);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not save the fourball scores.");
      onScoresSaved(data.scores);
      setDrafts({});
      if (advance) {
        goTo(currentIndex + 1);
      } else {
        setMessage(`Hole ${hole.number} saved.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the fourball scores.");
    } finally {
      onSavingChange(false);
    }
  }

  const savedCount = rows.filter((row) => row.saved).length;
  const draftsChanged = rows.some(({ value, saved }) => value !== "" && Number(value) !== saved?.grossScore);

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-950">Hole {hole.number}</h2>
          <p className="mt-1 text-sm text-stone-600">Par {hole.par} · Stroke index {hole.strokeIndex}</p>
        </div>
        <StatusPill>{savedCount}/{rows.length} saved</StatusPill>
      </div>
      {teamScoring === "fourball_alliance" && <SippyCupRules par={hole.par} />}
      <div className="mt-4">
        {rows.map((row) => {
          const handicap = getCompetitionHandicap(row.playingHandicap, teamScoring);
          const strokes = getHandicapStrokes(handicap, hole.strokeIndex, holes.length);
          const mulligans = teamScoring === "fourball_alliance" ? getAllianceMulligans(row.playingHandicap) : 0;
          const gross = Number(row.value);
          const valid = Number.isInteger(gross) && gross >= 1 && gross <= 20;
          return (
            <div key={row.id} className="flex items-center justify-between gap-3 border-t border-stone-200 py-3">
              <div>
                <p className="font-semibold text-emerald-950">{row.displayName}{row.id === playerId && " (you)"}</p>
                <p className="text-sm text-stone-600">
                  Hcp {handicap}
                  {mulligans > 0 && ` · ${mulligans} mulligan${mulligans === 1 ? "" : "s"}`}
                  {valid && (format === "stroke"
                    ? ` · Nett ${gross - strokes}`
                    : ` · ${getHolePoints(format, hole.par, strokes, gross)} pts`)}
                </p>
              </div>
              <label className="text-xs font-medium text-stone-600">
                Gross score
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  aria-label={`Gross score for ${row.displayName}`}
                  value={row.value}
                  disabled={saving || closed}
                  onChange={(event) => setDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))}
                  className="mt-1 block h-11 w-20 rounded-lg border border-stone-300 bg-white text-center text-xl font-semibold text-emerald-950"
                />
              </label>
            </div>
          );
        })}
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {message && <Alert tone="success" className="mt-3">{message}</Alert>}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button variant="secondary" disabled={saving || currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>Prev</Button>
        <Button disabled={saving || closed || !draftsChanged} onClick={() => void save(false)}>
          {saving ? "Saving…" : "Save scores"}
        </Button>
        <Button variant="secondary" disabled={saving || currentIndex >= holes.length - 1} onClick={() => {
          if (closed) goTo(currentIndex + 1);
          else void save(true);
        }}>
          Next
        </Button>
      </div>
    </Card>
  );
}
