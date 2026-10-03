import Link from "next/link";
import { PageShell, Button, Card } from "@/components/ui";

export default function HomePage() {
  return (
    <PageShell width="xl" center className="gap-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
          Fairway Live
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-emerald-950 sm:text-5xl">
          Keep every score in view.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Set up a round, invite your group with a short join code, and follow a
          live Stableford leaderboard from any phone.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/sign-in">
          <Button className="px-5 py-3">Host sign in</Button>
        </Link>
        <Link href="/join">
          <Button variant="secondary" className="px-5 py-3">
            Join a round
          </Button>
        </Link>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Real course data",
            body: "Import 18-hole tee sets or enter them manually. Snapshots freeze for the round.",
          },
          {
            title: "Mobile scoring",
            body: "Players enter gross scores hole by hole. Net Stableford points update instantly.",
          },
          {
            title: "Excel export",
            body: "Hosts download a full workbook: leaderboard, hole details, and setup.",
          },
        ].map((item) => (
          <li key={item.title}>
            <Card className="h-full">
              <h2 className="font-semibold text-emerald-900">{item.title}</h2>
              <p className="mt-2 text-sm text-stone-600">{item.body}</p>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
