import { NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const token = await createMagicLink(body.email);

    // Development response includes the token so the flow is testable
    // without an email provider. Do not return the token in production.
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json({
      ok: true,
      message: "Magic link created",
      ...(isDev ? { devToken: token } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }
    console.error("magic-link error", error);
    return NextResponse.json({ error: "Unable to create magic link" }, { status: 500 });
  }
}
