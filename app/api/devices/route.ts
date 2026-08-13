import { NextResponse } from "next/server";
import { listDevices, registerDevice, removeDevice } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ devices: listDevices().map(({ token, ...rest }) => ({ ...rest, tokenTail: token.slice(-6) })) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; platform?: string; label?: string };
    registerDevice({ token: body.token ?? "", platform: body.platform, label: body.label });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register device.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      return NextResponse.json({ error: "A device token is required." }, { status: 400 });
    }
    removeDevice(body.token);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
