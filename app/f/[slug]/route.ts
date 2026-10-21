import { NextResponse } from "next/server";
import { countPublicFileHit, getPublicFile } from "@/app/lib/db";
import { readMediaFile } from "@/app/lib/media-store";

export const runtime = "nodejs";

/**
 * A link we own, handed to hundreds of women inside a WhatsApp message.
 *
 * Public on purpose: the people opening it are not logged in and never
 * will be. What makes it safe is that it serves exactly one file that
 * somebody here chose, by a slug somebody here named — not any path a
 * caller can ask for.
 *
 * And it is the slug, not the file, that goes in the message. The Clean
 * programme's old link was a landing-page service's own URL, so when that
 * service stopped serving the file there was nothing to repoint: 243
 * women held a dead address and the only fix was a new message to all of
 * them. Here the address outlives the file behind it.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const file = getPublicFile(String(slug).toLowerCase());

  if (!file) {
    return new NextResponse(page("الملف مش جاهز بعد", "جرّبي بعد شوي، أو احكي معنا على الواتساب."), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  let bytes: Buffer;
  try {
    bytes = readMediaFile(file.filename);
  } catch {
    // The row exists and the bytes do not: say so plainly rather than
    // showing somebody a broken download.
    return new NextResponse(page("الملف بينرفع هلق", "رجعي بعد دقايق — الرابط نفسه بيضل شغّال."), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  countPublicFileHit(file.slug);

  const name = encodeURIComponent(file.downloadName || `${file.slug}.pdf`);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": file.mimeType,
      // Inline: WhatsApp's own browser shows a PDF rather than downloading it.
      "content-disposition": `inline; filename*=UTF-8''${name}`,
      // Short, because the whole point is that the file behind the slug
      // can be replaced and everyone sees the new one.
      "cache-control": "public, max-age=300"
    }
  });
}

function page(title: string, line: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#F1EEE7;
font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2F3A2E;padding:24px}
div{max-width:28rem;text-align:center}h1{font-size:19px;margin:0 0 8px}p{margin:0;color:#6B7566}</style>
</head><body><div><h1>${title}</h1><p>${line}</p></div></body></html>`;
}
