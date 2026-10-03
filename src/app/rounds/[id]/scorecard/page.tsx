"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PageShell,
  Topbar,
  Button,
  Card,
  Alert,
  StatusPill,
} from "@/components/ui";
import {
  getHandicapStrokes,
  getHolePoints,
  type ScoringFormat,
} from "@/domain/scoring";

type Hole = {
  number: number;
  par: number;
  strokeIndex: number;
};

type Row = {
  holeNumber: number;
  par: number;
  si: number;
  strokes: number;
  gross: number | null;
  nett: number | null;
  points: number | null;
  note?: string;
};

export default function ScorecardPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = String(params.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({
    name: "",
    course: "",
    hcp: 0,
    format: "stableford" as ScoringFormat,
    points: 0,
    gross: 0,
    nett: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        const player = sessionData.player;
        if (!player || player.roundId !== roundId) {
          router.push("/join");
          return;
        }
        const [lbRes, notesRes] = await Promise.all([
          fetch(`/api/rounds/${roundId}/leaderboard`),
          fetch(`/api/rounds/${roundId}/notes`),
        ]);
        const lb = await lbRes.json();
        const notesData = notesRes.ok ? await notesRes.json() : { notes: [] };
        if (!lbRes.ok) throw new Error(lb.error || "Failed to load");
        if (cancelled) return;

        const format = (lb.round.scoringFormat || "stableford") as ScoringFormat;
        const holesCount = lb.round.holesCount || 18;
        const holes: Hole[] = lb.holes || [];
        const scoreMap = new Map<number, { grossScore: number }>();
        for (const s of lb.myScores || []) {
          scoreMap.set(s.holeNumber, s);
        }
        const noteMap = new Map<number, string>();
        for (const n of notesData.notes || []) {
          noteMap.set(n.holeNumber, n.note);
        }

        let points = 0;
        let gross = 0;
        let nett = 0;
        const built: Row[] = holes.map((h) => {
          const sc = scoreMap.get(h.number);
          const hs = getHandicapStrokes(
            player.playingHandicap,
            h.strokeIndex,
            holesCount
          );
          if (!sc) {
            return {
              holeNumber: h.number,
              par: h.par,
              si: h.strokeIndex,
              strokes: hs,
              gross: null,
              nett: null,
              points: null,
              note: noteMap.get(h.number),
            };
          }
          const g = sc.grossScore;
          const n = g - hs;
          const p = getHolePoints(format, h.par, hs, g);
          points += p;
          gross += g;
          nett += n;
          return {
            holeNumber: h.number,
            par: h.par,
            si: h.strokeIndex,
            strokes: hs,
            gross: g,
            nett: n,
            points: p,
            note: noteMap.get(h.number),
          };
        });

        setRows(built);
        setMeta({
          name: player.displayName,
          course: lb.round.courseName,
          hcp: player.playingHandicap,
          format,
          points,
          gross,
          nett,
        });
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
  }, [roundId, router]);

  if (loading) {
    return (
      <PageShell width="md">
        <p className="text-sm text-stone-500">Loading scorecard…</p>
      </PageShell>
    );
  }

  return (
    <PageShell width="md">
      <Topbar
        backHref={`/rounds/${roundId}/leaderboard`}
        backLabel="Leaderboard"
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/rounds/${roundId}/score`)}
          >
            Enter scores
          </Button>
        }
      />
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
        My scorecard
      </p>
      <h1 className="mt-1 text-2xl font-bold text-emerald-950">{meta.course}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {meta.name} · Hcp {meta.hcp} · {meta.format.replace("_", " ")}
      </p>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill tone="success">Gross {meta.gross}</StatusPill>
        <StatusPill>Nett {meta.nett}</StatusPill>
        {meta.format !== "stroke" && (
          <StatusPill tone="success">Pts {meta.points}</StatusPill>
        )}
      </div>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="bg-emerald-900 text-white">
                <th className="px-3 py-2">Hole</th>
                <th className="px-3 py-2">Par</th>
                <th className="px-3 py-2">SI</th>
                <th className="px-3 py-2">Strokes</th>
                <th className="px-3 py-2">Gross</th>
                <th className="px-3 py-2">Nett</th>
                <th className="px-3 py-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.holeNumber} className="border-b border-stone-100">
                  <td className="px-3 py-2 font-semibold">{r.holeNumber}</td>
                  <td className="px-3 py-2">{r.par}</td>
                  <td className="px-3 py-2">{r.si}</td>
                  <td className="px-3 py-2">{r.strokes}</td>
                  <td className="px-3 py-2">{r.gross ?? "—"}</td>
                  <td className="px-3 py-2">{r.nett ?? "—"}</td>
                  <td className="px-3 py-2">
                    {meta.format === "stroke" ? "—" : (r.points ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {rows.some((r) => r.note) && (
        <Card className="mt-4">
          <h2 className="font-semibold text-emerald-950">Hole notes</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {rows
              .filter((r) => r.note)
              .map((r) => (
                <li key={r.holeNumber}>
                  <strong>H{r.holeNumber}:</strong> {r.note}
                </li>
              ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
