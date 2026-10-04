import { NextResponse } from "next/server";
import { findPersonFileByName, readPersonFileBytes } from "@/app/lib/person-files";

export const runtime = "nodejs";

/** Behind the login, like every page: these are members' health documents. */
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const file = findPersonFileByName(filename);

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  try {
    const bytes = readPersonFileBytes(file.filename);
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        // The original Arabic name, for whoever saves it to their machine.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName || file.label)}`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
