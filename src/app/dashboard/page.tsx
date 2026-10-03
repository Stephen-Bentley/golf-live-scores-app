import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageShell, Topbar, Card, Button, StatusPill } from "@/components/ui";

function statusTone(status: string): "neutral" | "success" | "warning" | "muted" {
  if (status === "active") return "success";
  if (status === "ready_for_export") return "warning";
  if (status === "closed" || status === "archived") return "muted";
  return "neutral";
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  if (session.role === "player") {
    const round = await prisma.round.findUnique({
      where: { id: session.roundId },
    });

    return (
      <PageShell width="lg">
        <Topbar
          backHref="/"
          actions={
            <form action="/api/auth/session?_method=DELETE">
              <Link href="/" className="text-sm text-stone-600 hover:underline">
                Sign out
              </Link>
            </form>
          }
        />
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
          Player dashboard
        </p>
        <h1 className="mt-1 text-2xl font-bold text-emerald-950">
          Hi, {session.displayName}
        </h1>

        {round ? (
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-emerald-950">
                  {round.courseName}
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {round.teeName} · Par snapshot frozen
                </p>
              </div>
              <StatusPill tone={statusTone(round.status)}>{round.status}</StatusPill>
            </div>
            <p className="mt-3 text-sm text-stone-700">
              Handicap: <strong>{session.playingHandicap}</strong>
              {" · "}
              Join code: <strong>{round.joinCode}</strong>
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/rounds/${round.id}/score`}>
                <Button
                  disabled={
                    round.status === "closed" || round.status === "archived"
                  }
                >
                  Enter scores
                </Button>
              </Link>
              <Link href={`/rounds/${round.id}/leaderboard`}>
                <Button variant="secondary">Leaderboard</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <AlertTone message="Round not found. Sign out and join again with a valid code." />
        )}
      </PageShell>
    );
  }

  const rounds = await prisma.round.findMany({
    where: { hostId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { players: true, _count: { select: { exports: true } } },
  });
  const totalPlayers = rounds.reduce((s, r) => s + r.players.length, 0);
  const totalExports = rounds.reduce((s, r) => s + r._count.exports, 0);

  return (
    <PageShell width="lg">
      <Topbar
        backHref="/"
        actions={
          <Link href="/" className="text-sm text-stone-600 hover:underline">
            Sign out
          </Link>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            Host dashboard
          </p>
          <h1 className="mt-1 text-2xl font-bold text-emerald-950">
            Good to see you, {session.email.split("@")[0]}
          </h1>
        </div>
        <Link href="/rounds/new">
          <Button>Create a round</Button>
        </Link>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase text-stone-500">Rounds</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{rounds.length}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase text-stone-500">Player seats</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{totalPlayers}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase text-stone-500">Exports</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{totalExports}</p>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-emerald-950">Your rounds</h2>
        {rounds.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-stone-600">
              No rounds yet. Create one from a course and tee set, then share the
              join code with your group.
            </p>
            <Link href="/rounds/new" className="mt-4 inline-block">
              <Button>Create your first round</Button>
            </Link>
          </Card>
        ) : (
          <ul className="mt-4 space-y-3">
            {rounds.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-emerald-950">
                          {r.courseName}
                        </h3>
                        <StatusPill tone={statusTone(r.status)}>
                          {r.status}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-stone-600">
                        {r.teeName} · {r.players.length} player
                        {r.players.length === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-sm text-stone-700">
                        Join code: <strong className="tracking-wider">{r.joinCode}</strong>
                        {!r.joinCodeActive && (
                          <span className="ml-2 text-amber-800">(revoked)</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/rounds/${r.id}/score`}>
                        <Button variant="secondary">Enter scores</Button>
                      </Link>
                      <Link href={`/rounds/${r.id}/leaderboard`}>
                        <Button variant="secondary">Leaderboard</Button>
                      </Link>
                      <Link href={`/rounds/${r.id}/leaderboard?clone=1`}>
                        <Button variant="quiet">Reuse setup</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function AlertTone({ message }: { message: string }) {
  return (
    <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {message}
    </p>
  );
}
