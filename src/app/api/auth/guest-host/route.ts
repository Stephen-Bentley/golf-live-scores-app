import { NextResponse } from "next/server";
import { z } from "zod";
import { createGuestHost, setHostSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

/**
 * Start hosting without email — creates a local guest host account.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const session = await createGuestHost(body.displayName);
    await setHostSessionCookie(session);
    return NextResponse.json({
      ok: true,
      email: session.email,
      displayName: session.displayName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a display name (1–40 characters)." },
        { status: 400 }
      );
    }
    console.error("guest-host error", error);
    return NextResponse.json(
      { error: "Could not create host session" },
      { status: 500 }
    );
  }
}
