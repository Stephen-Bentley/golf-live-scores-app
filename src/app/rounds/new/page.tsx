"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageShell,
  Topbar,
  Input,
  Button,
  Alert,
  Card,
  StatusPill,
} from "@/components/ui";

type HoleRow = {
  number: number;
  par: number;
  strokeIndex: number;
  distance: string;
};

type SearchCourse = {
  id: string;
  club_name: string;
  course_name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  tees?: {
    male?: number;
    female?: number;
  };
};

type ApiTee = {
  tee_name: string;
  course_rating?: number;
  slope_rating?: number;
  number_of_holes?: number;
  holes?: Array<{
    par: number;
    yardage?: number;
    handicap: number;
  }>;
};

type CourseDetail = {
  id: string;
  club_name: string;
  course_name: string;
  location?: SearchCourse["location"];
  tees?: {
    male?: ApiTee[];
    female?: ApiTee[];
  };
};

function defaultHoles(): HoleRow[] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
    distance: "",
  }));
}

function formatLocation(loc?: SearchCourse["location"]): string {
  if (!loc) return "";
  return [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
}

function teeOptionsFromDetail(detail: CourseDetail): Array<{
  key: string;
  label: string;
  gender: "male" | "female";
  tee: ApiTee;
}> {
  const options: Array<{
    key: string;
    label: string;
    gender: "male" | "female";
    tee: ApiTee;
  }> = [];
  for (const gender of ["male", "female"] as const) {
    const list = detail.tees?.[gender] || [];
    list.forEach((tee, index) => {
      const holes = tee.holes?.length ?? 0;
      if (holes !== 18) return;
      options.push({
        key: `${gender}-${index}-${tee.tee_name}`,
        label: `${tee.tee_name} (${gender}) · ${tee.course_rating ?? "—"} / ${tee.slope_rating ?? "—"}`,
        gender,
        tee,
      });
    });
  }
  return options;
}

function holesFromApiTee(tee: ApiTee): HoleRow[] {
  const holes = tee.holes || [];
  return Array.from({ length: 18 }, (_, i) => {
    const h = holes[i];
    return {
      number: i + 1,
      par: h?.par ?? 4,
      strokeIndex: h?.handicap ?? i + 1,
      distance: h?.yardage != null ? String(h.yardage) : "",
    };
  });
}

export default function NewRoundPage() {
  const router = useRouter();
  const [courseName, setCourseName] = useState("");
  const [courseLocation, setCourseLocation] = useState("");
  const [teeName, setTeeName] = useState("White");
  const [teeColour, setTeeColour] = useState("White");
  const [holes, setHoles] = useState<HoleRow[]>(defaultHoles);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoringFormat, setScoringFormat] = useState<
    "stableford" | "stroke" | "modified_stableford"
  >("stableford");
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [teamScoring, setTeamScoring] = useState<"aggregate" | "better_ball">(
    "aggregate"
  );


  // Search state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseLabel, setSelectedCourseLabel] = useState<string | null>(
    null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [teeChoices, setTeeChoices] = useState<
    Array<{ key: string; label: string; gender: "male" | "female"; tee: ApiTee }>
  >([]);
  const [selectedTeeKey, setSelectedTeeKey] = useState<string | null>(null);

  function updateHole(
    index: number,
    field: keyof HoleRow,
    value: string | number
  ) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const term = query.trim();
    if (!term) {
      setSearchError("Enter a course name, city, or club to search.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setResults([]);
    // Keep selection unless user starts a new search — clear selection on new search
    setSelectedCourseId(null);
    setSelectedCourseLabel(null);
    setTeeChoices([]);
    setSelectedTeeKey(null);

    try {
      const res = await fetch(
        `/api/golf/courses?name=${encodeURIComponent(term)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Search failed");
      }
      const list: SearchCourse[] = data.courses || [];
      setResults(list);
      if (list.length === 0) {
        setSearchError("No courses found. Try a different search or enter details manually.");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function selectCourse(course: SearchCourse) {
    setSelectedCourseId(course.id);
    const label = [course.club_name, course.course_name]
      .filter(Boolean)
      .join(" — ");
    setSelectedCourseLabel(label);
    setCourseName(course.course_name || course.club_name || label);
    setCourseLocation(formatLocation(course.location));
    setSearchError(null);
    setLoadingDetail(true);
    setTeeChoices([]);
    setSelectedTeeKey(null);

    try {
      const res = await fetch(`/api/golf/courses/${encodeURIComponent(course.id)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not load course details");
      }
      const detail = (data.course || data) as CourseDetail;
      const options = teeOptionsFromDetail(detail);
      setTeeChoices(options);
      if (options.length === 0) {
        setSearchError(
          "This course has no 18-hole tee sets in the API. You can still enter holes manually below."
        );
      } else {
        // Auto-select first tee
        applyTee(options[0]);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Could not load course details"
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  function applyTee(option: {
    key: string;
    label: string;
    gender: "male" | "female";
    tee: ApiTee;
  }) {
    setSelectedTeeKey(option.key);
    setTeeName(option.tee.tee_name || "Tees");
    setTeeColour(option.tee.tee_name || "Tees");
    setHoles(holesFromApiTee(option.tee));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const snapshotHoles = holes.map((h) => ({
        number: h.number,
        par: Number(h.par),
        strokeIndex: Number(h.strokeIndex),
        distance: h.distance === "" ? null : Number(h.distance),
      }));

      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseName,
          courseLocation,
          teeSetSnapshot: {
            name: teeName,
            colour: teeColour,
            holes: snapshotHoles.slice(0, holesCount),
          },
          scoringFormat,
          holesCount,
          teamScoring,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create round");
      router.push(`/rounds/${data.round.id}/leaderboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create round");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell width="lg">
      <Topbar backHref="/dashboard" backLabel="Dashboard" />
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
        Round setup
      </p>
      <h1 className="mt-1 text-2xl font-bold text-emerald-950">Create a round</h1>
      <p className="mt-2 text-sm text-stone-600">
        Search for a course, pick it from the results, choose a tee set, then
        create the round. You can still edit holes manually.
      </p>

      {/* --- Course search --- */}
      <Card className="mt-8 space-y-4">
        <h2 className="font-semibold text-emerald-950">Find a course</h2>
        <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Pebble Beach, St Andrews…"
              hint="Searches GolfCourseAPI (name, city, or club)"
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>

        {searchError && <Alert tone="warning">{searchError}</Alert>}

        {selectedCourseId && selectedCourseLabel && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <StatusPill tone="success">Selected</StatusPill>
            <span className="font-medium">{selectedCourseLabel}</span>
            <button
              type="button"
              className="ml-auto text-xs font-semibold text-emerald-800 underline"
              onClick={() => {
                setSelectedCourseId(null);
                setSelectedCourseLabel(null);
                setTeeChoices([]);
                setSelectedTeeKey(null);
              }}
            >
              Clear selection
            </button>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
              {results.length} result{results.length === 1 ? "" : "s"} — choose one
            </p>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {results.map((course) => {
                const selected = course.id === selectedCourseId;
                const title =
                  course.club_name === course.course_name
                    ? course.club_name
                    : `${course.club_name} — ${course.course_name}`;
                const loc = formatLocation(course.location);
                return (
                  <li key={course.id}>
                    <button
                      type="button"
                      onClick={() => void selectCourse(course)}
                      disabled={loadingDetail}
                      className={[
                        "w-full rounded-xl border px-4 py-3 text-left transition",
                        selected
                          ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700"
                          : "border-stone-200 bg-white hover:border-emerald-400 hover:bg-stone-50",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-emerald-950">{title}</p>
                          {loc && (
                            <p className="mt-0.5 text-sm text-stone-600">{loc}</p>
                          )}
                          {course.location?.address && (
                            <p className="mt-0.5 text-xs text-stone-500">
                              {course.location.address}
                            </p>
                          )}
                        </div>
                        {selected ? (
                          <StatusPill tone="success">Selected</StatusPill>
                        ) : (
                          <span className="text-xs font-medium text-stone-400">
                            Tap to select
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {loadingDetail && (
          <p className="text-sm text-stone-500">Loading tee sets…</p>
        )}

        {teeChoices.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">
              Tee set for this round
            </p>
            <ul className="space-y-2">
              {teeChoices.map((opt) => {
                const selected = opt.key === selectedTeeKey;
                return (
                  <li key={opt.key}>
                    <button
                      type="button"
                      onClick={() => applyTee(opt)}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                        selected
                          ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-600"
                          : "border-stone-200 bg-white hover:border-emerald-400",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <span className="font-medium text-emerald-950">
                        {opt.label}
                      </span>
                      {selected && (
                        <span className="ml-2 text-xs font-semibold text-emerald-800">
                          · Selected
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        <Card className="space-y-4">
          <h2 className="font-semibold text-emerald-950">Format</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-700">
              Scoring
              <select
                value={scoringFormat}
                onChange={(e) =>
                  setScoringFormat(
                    e.target.value as
                      | "stableford"
                      | "stroke"
                      | "modified_stableford"
                  )
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              >
                <option value="stableford">Stableford</option>
                <option value="stroke">Stroke play (nett)</option>
                <option value="modified_stableford">Modified Stableford</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Holes
              <select
                value={holesCount}
                onChange={(e) => setHolesCount(Number(e.target.value) as 9 | 18)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              >
                <option value={18}>18 holes</option>
                <option value={9}>9 holes</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-stone-700 sm:col-span-2">
              Team scoring
              <select
                value={teamScoring}
                onChange={(e) =>
                  setTeamScoring(e.target.value as "aggregate" | "better_ball")
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              >
                <option value="aggregate">
                  Society / pairs total (sum all members)
                </option>
                <option value="better_ball">
                  Fourball better-ball (best score each hole)
                </option>
              </select>
            </label>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold text-emerald-950">Course & tees</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Course name"
              required
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Royal Links"
            />
            <Input
              label="Location"
              required
              value={courseLocation}
              onChange={(e) => setCourseLocation(e.target.value)}
              placeholder="City, Country"
            />
            <Input
              label="Tee set name"
              required
              value={teeName}
              onChange={(e) => setTeeName(e.target.value)}
            />
            <Input
              label="Tee colour"
              required
              value={teeColour}
              onChange={(e) => setTeeColour(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-emerald-950">18 holes</h2>
          <p className="mt-1 text-xs text-stone-500">
            Par 3–6 · Stroke index unique 1–18 · Distance optional. Filled from
            the selected tee when you pick a course.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-2 font-medium">Hole</th>
                  <th className="py-2 pr-2 font-medium">Par</th>
                  <th className="py-2 pr-2 font-medium">SI</th>
                  <th className="py-2 font-medium">Yards</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h, index) => (
                  <tr key={h.number} className="border-b border-stone-100">
                    <td className="py-2 pr-2 font-medium text-stone-800">
                      {h.number}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={3}
                        max={6}
                        required
                        value={h.par}
                        onChange={(e) =>
                          updateHole(index, "par", Number(e.target.value))
                        }
                        className="w-16 rounded border border-stone-300 px-2 py-1"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={1}
                        max={18}
                        required
                        value={h.strokeIndex}
                        onChange={(e) =>
                          updateHole(
                            index,
                            "strokeIndex",
                            Number(e.target.value)
                          )
                        }
                        className="w-16 rounded border border-stone-300 px-2 py-1"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={h.distance}
                        onChange={(e) =>
                          updateHole(index, "distance", e.target.value)
                        }
                        placeholder="—"
                        className="w-20 rounded border border-stone-300 px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create round"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
