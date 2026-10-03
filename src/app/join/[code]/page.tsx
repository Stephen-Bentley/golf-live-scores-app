import { redirect } from "next/navigation";

type Props = { params: Promise<{ code: string }> };

/** Shareable short path: /join/ABC123 → /join?joinCode=ABC123 */
export default async function JoinCodePage({ params }: Props) {
  const { code } = await params;
  const cleaned = decodeURIComponent(code).trim().toUpperCase();
  redirect(`/join?joinCode=${encodeURIComponent(cleaned)}`);
}
