import { NextResponse } from "next/server";
import { getHostSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const GOLF_API = "https://api.golfcourseapi.com";

/**
 * Proxy for GolfCourseAPI search — keeps the Bearer token server-side.
 */
export async function GET(request: Request) {
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = checkRateLimit(`golf-search:${host.userId}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many course searches. Try again shortly." }, { status: 429 });
  }
  const apiKey = process.env.GOLF_COURSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Golf Course API is not configured. Set GOLF_COURSE_API_KEY on the server.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const terms = ["name", "city", "country"]
    .map((k) => searchParams.get(k))
    .filter(Boolean)
    .join(" ");

  if (!terms) {
    return NextResponse.json(
      { error: "Provide a course name, city, or country to search." },
      { status: 400 }
    );
  }

  const upstream = new URL(`${GOLF_API}/v1/search`);
  upstream.searchParams.set("search_query", terms);
  upstream.searchParams.set("fuzzy_match", "true");

  try {
    const res = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The Golf Course API could not be reached." },
      { status: 502 }
    );
  }
}
