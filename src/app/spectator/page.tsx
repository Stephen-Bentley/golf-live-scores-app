"use client";

import { useEffect, useState } from "react";
import { Alert, Card, PageShell } from "@/components/ui";
import type { SpectatorBoard } from "@/app/api/spectator/route";

export default function SpectatorPage() {
  const [board, setBoard] = useState<SpectatorBoard>();
  const [error, setError] = useState("");

  const [token, setToken] = useState<string>();

  useEffect(() => {
    const readLink = () => setToken(window.location.hash.slice(1));
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    setBoard(undefined);
    setError("");
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) {
      setError("This spectator link is unavailable.");
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/spectator", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "omit", cache: "no-store", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setBoard(undefined);
          setError("This spectator link is unavailable.");
          return;
        }
        if (!response.ok) throw new Error("Standings unavailable");
        const standings = await response.json();
        if (controller.signal.aborted) return;
        setBoard(standings);
        setError("");
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not refresh standings. Reconnecting…");
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [token]);

  return (
    <PageShell width="xl">
      <h1 className="text-3xl font-semibold text-emerald-950">Spectator leaderboard</h1>
      {error && <Alert className="mt-4" tone="warning">{error}</Alert>}
      {!board && !error && <p className="mt-4 text-stone-600">Loading standings…</p>}
      {board && (
        <>
          <p className="mt-2 text-stone-600">{board.courseName} · {board.holesCount} holes</p>
          {([["Teams", board.teams], ["Players", board.players]] as const).map(([title, rows]) => rows.length > 0 && (
            <Card key={title} className="mt-6 overflow-x-auto">
              <h2 className="mb-3 text-lg font-semibold text-emerald-950">{title}</h2>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-stone-600">
                  <tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">{title === "Teams" && board.teamNetToPar ? "Nett to par" : board.format === "stroke" ? "Nett" : "Points"}</th><th scope="col">Holes played</th></tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="border-b border-stone-100">
                      <td className="py-2">{row.rank || "—"}</td>
                      <th scope="row" className="font-medium">{row.name}</th>
                      <td>{row.holesPlayed ? row.result : "—"}</td>
                      <td>{row.holesPlayed} / {board.holesCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {!board.players.length && !board.teams.length && <p className="mt-6 text-stone-600">Standings will appear when players join.</p>}
        </>
      )}
    </PageShell>
  );
}
