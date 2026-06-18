import { NextResponse } from "next/server";
import { readMediaFile, safeMediaFilename } from "@/app/lib/media-store";

export const runtime = "nodejs";

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  mov: "video/quicktime",
  pdf: "application/pdf"
};

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const params = await context.params;
  const filename = safeMediaFilename(params.filename);

  try {
    const bytes = readMediaFile(filename);
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    return new Response(bytes, {
      headers: {
        "Content-Type": mimeByExtension[extension] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Media file not found." }, { status: 404 });
  }
}
