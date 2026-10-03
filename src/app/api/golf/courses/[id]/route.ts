import { NextResponse } from "next/server";

const GOLF_API = "https://api.golfcourseapi.com";

type Params = { params: Promise<{ id: string }> };

/**
 * Proxy for GolfCourseAPI course detail — keeps the Bearer token server-side.
 * Used when importing a tee set into a frozen round snapshot.
 */
export async function GET(_request: Request, { params }: Params) {
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

  const { id } = await params;
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${GOLF_API}/v1/courses/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
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
