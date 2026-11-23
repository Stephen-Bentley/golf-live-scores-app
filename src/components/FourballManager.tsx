"use client";

import { useState, type FormEvent } from "react";
import { FOURBALL_CAPACITY } from "@/domain/fourball";
import { Alert, Button, Input } from "@/components/ui";

export type Fourball = {
  id: string;
  name: string;
  teeTime: string | null;
  startingHole: number;
};

export type RosterPlayer = {
  id: string;
  displayName: string;
  playingHandicap: number;
  fourballId: string | null;
  teamId: string | null;
  inviteCode: string | null;
};

type Props = {
  roundId: string;
  fourballs: Fourball[];
  players: RosterPlayer[];
  teams: { id: string; name: string }[];
  holes: number[];
  locked: boolean;
  canInvite: boolean;
  onSaved: () => Promise<void>;
};

const selectClass = "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

export function FourballManager({ roundId, fourballs, players, teams, holes, locked, canInvite, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [visibleLink, setVisibleLink] = useState<{ playerId: string; url: string } | null>(null);

  async function save(resource: "fourballs" | "players", method: "POST" | "PATCH", body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rounds/${roundId}/${resource}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the fourballs.");
      await onSaved();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the fourballs.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createFourball(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const success = await save("fourballs", "POST", {
      name: data.get("name"),
      teeTime: data.get("teeTime") || undefined,
      startingHole: Number(data.get("startingHole")),
    });
    if (success) form.reset();
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const success = await save("players", "POST", {
      displayName: data.get("displayName"),
      playingHandicap: Number(data.get("playingHandicap")),
      fourballId: data.get("fourballId"),
      teamId: data.get("teamId") || null,
    });
    if (success) form.reset();
  }

  async function copyInvite(player: RosterPlayer) {
    if (!player.inviteCode) return;
    setCopied(null);
    setVisibleLink(null);
    setError(null);
    const url = new URL("/join", window.location.origin);
    url.searchParams.set("invite", player.inviteCode);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(player.id);
    } catch {
      setVisibleLink({ playerId: player.id, url: url.href });
    }
  }

  const disabled = busy || locked;
  const groups = fourballs.map((group) => ({
    ...group,
    members: players.filter((player) => player.fourballId === group.id),
  }));
  const vacancies = groups.filter((group) => group.members.length < FOURBALL_CAPACITY);
  const unassigned = players.filter((player) => !player.fourballId);

  function playerRow(player: RosterPlayer) {
    return (
      <li key={player.id} className="grid items-end gap-2 border-t border-stone-200 py-3 sm:grid-cols-2">
        <div>
          <p className="font-medium text-emerald-950">{player.displayName}</p>
          <p className="text-sm text-stone-600">Hcp {player.playingHandicap}</p>
          {player.inviteCode && canInvite && !locked && (
            <Button type="button" variant="quiet" className="px-0 py-1" onClick={() => void copyInvite(player)}>
              {copied === player.id ? "Player link copied" : "Copy private player link"}
            </Button>
          )}
          {visibleLink?.playerId === player.id && canInvite && !locked && (
            <Input
              id={`player-link-${player.id}`}
              label="Private player link"
              value={visibleLink.url}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
        <div className={teams.length ? "grid grid-cols-2 gap-2" : undefined}>
          <label className="block text-sm text-stone-700">
            Fourball
            <select
              aria-label={`Fourball for ${player.displayName}`}
              className={selectClass}
              value={player.fourballId ?? ""}
              disabled={disabled}
              onChange={(event) => void save("players", "PATCH", {
                playerId: player.id, fourballId: event.target.value || null,
              })}
            >
              <option value="">Unassigned</option>
              {groups.map((group) => (
                <option
                  key={group.id}
                  value={group.id}
                  disabled={group.id !== player.fourballId && group.members.length >= FOURBALL_CAPACITY}
                >
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          {teams.length > 0 && (
            <label className="block text-sm text-stone-700">
              Competition team
              <select
                aria-label={`Competition team for ${player.displayName}`}
                className={selectClass}
                value={player.teamId ?? ""}
                disabled={disabled}
                onChange={(event) => void save("players", "PATCH", {
                  playerId: player.id, teamId: event.target.value || null,
                })}
              >
                <option value="">None</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="space-y-4 border-t border-stone-200 pt-6" aria-labelledby="fourball-heading">
      <h3 id="fourball-heading" className="font-semibold text-emerald-950">Fourballs</h3>
      {!locked && (
        <form onSubmit={createFourball} className="grid items-end gap-2 sm:grid-cols-4">
          <Input label="Fourball name" name="name" maxLength={40} placeholder="Fourball 1" disabled={disabled} required />
          <Input label="Tee time" name="teeTime" type="time" disabled={disabled} />
          <label className="block text-sm font-medium text-stone-700">
            Starting hole
            <select name="startingHole" className={selectClass} disabled={disabled}>
              {holes.map((hole) => <option key={hole} value={hole}>{hole}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={disabled}>Create fourball</Button>
        </form>
      )}
      {groups.map((group) => (
        <div key={group.id} className="rounded-lg border border-stone-200 px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-1">
            <h4 className="font-semibold text-emerald-950">{group.name}</h4>
            <p className="text-sm text-stone-600">
              {group.teeTime && `${group.teeTime} · `}Hole {group.startingHole} · {group.members.length}/{FOURBALL_CAPACITY} players
            </p>
          </div>
          {group.members.length > 0 && <ul>{group.members.map(playerRow)}</ul>}
        </div>
      ))}
      {unassigned.length > 0 && (
        <div className="rounded-lg border border-stone-200 px-3 py-2">
          <h4 className="py-1 font-semibold text-emerald-950">Unassigned players</h4>
          <ul>{unassigned.map(playerRow)}</ul>
        </div>
      )}
      {!locked && vacancies.length > 0 && (
        <form onSubmit={addPlayer} className="space-y-3 rounded-lg bg-stone-50 p-3">
          <h4 className="font-semibold text-emerald-950">Add a player to a fourball</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Player name" name="displayName" maxLength={40} disabled={disabled} required />
            <Input label="Playing handicap" name="playingHandicap" type="number" min={0} max={54} disabled={disabled} required />
            <label className="block text-sm font-medium text-stone-700">
              Fourball
              <select name="fourballId" className={selectClass} disabled={disabled} required defaultValue="">
                <option value="" disabled>Select a fourball</option>
                {vacancies.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            {teams.length > 0 && (
              <label className="block text-sm font-medium text-stone-700">
                Competition team
                <select name="teamId" className={selectClass} disabled={disabled}>
                  <option value="">None</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <Button type="submit" disabled={disabled}>Add player</Button>
        </form>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
