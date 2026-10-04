import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { isInlineType } from "@/app/lib/person-file-kinds";
import { findPersonFileByName, readPersonFileBytes } from "@/app/lib/person-files";

export const runtime = "nodejs";

/** Behind the login, like every page: these are members' health documents. */
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const auth = await requireApi("files.view");
  if (!auth.ok) {
    return auth.response;
  }

  const { filename } = await context.params;
  const file = findPersonFileByName(filename);

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  try {
    const bytes = readPersonFileBytes(file.filename);

    // A stored type is whatever the uploader's browser claimed. Only the few
    // types a plan or a photo actually is are handed back as themselves and
    // opened in the tab; everything else downloads as untyped bytes, so an
    // .html can never run on this app's own origin beside the session cookie.
    const inline = isInlineType(file.mimeType);
    const name = encodeURIComponent(file.originalName || file.label);

    return new Response(bytes, {
      headers: {
        "Content-Type": inline ? file.mimeType : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
