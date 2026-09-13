import { NextResponse } from "next/server";
import { listFollowups } from "@/app/lib/journeys/followups";
import { getMember } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as "sms" | "manual" | null;
  const state = url.searchParams.get("state");

  const followups = listFollowups({ kind: kind ?? undefined, state: state ?? undefined }).map((item) => {
    const member = getMember(item.memberId);
    return { ...item, memberName: member?.name ?? "", memberPhone: member?.phone ?? "" };
  });

  return NextResponse.json({ followups, smsProvider: process.env.SMS_PROVIDER ?? "none" });
}
