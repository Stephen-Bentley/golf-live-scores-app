import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeMagicLink, setHostSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const session = await consumeMagicLink(body.token);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired magic link" },
        { status: 401 }
      );
    }
    await setHostSessionCookie(session);
    return NextResponse.json({ ok: true, email: session.email });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("verify error", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
