import { notFound, redirect } from "next/navigation";
import { one } from "@/lib/db";

/** Invite link: opens the club page with the code, which lets the visitor join a closed club. */
export default async function JoinClub({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const club = await one<{ tag: string }>("select tag from clubs where invite_code = $1", [code]);
  if (!club) notFound();
  redirect(`/clubs/${club.tag}?code=${encodeURIComponent(code)}`);
}
