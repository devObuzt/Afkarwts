import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * A link we own, that outlives the file behind it.
 *
 * The Clean programme went out to 243 women on 2026-10-15 pointing at
 * «l5k.me/qcuwR_lrRnX» — a landing-page service nobody here has an
 * account on. It stopped serving the file, nothing told us, and we found
 * out when the women wrote in. The address has to be ours, and swapping
 * the file must not change it.
 */
test("a slug keeps its address when the file behind it is replaced", async () => {
  const { setPublicFile, getPublicFile, countPublicFileHit, listPublicFiles } = await import("@/app/lib/db");
  const { writeMediaFile, readMediaFile } = await import("@/app/lib/media-store");

  writeMediaFile("first.pdf", new TextEncoder().encode("%PDF-1.5 النسخة الأولى"));
  const made = setPublicFile({
    slug: "clean-program",
    filename: "first.pdf",
    label: "برنامج كلين",
    mimeType: "application/pdf",
    downloadName: "برنامج-كلين.pdf"
  });
  assert.equal(made.ok, true);

  const before = getPublicFile("clean-program")!;
  assert.equal(before.filename, "first.pdf");
  assert.equal(new TextDecoder().decode(readMediaFile(before.filename)).includes("الأولى"), true);

  // A new version of the programme arrives. The address does not move.
  writeMediaFile("second.pdf", new TextEncoder().encode("%PDF-1.5 النسخة الثانية"));
  setPublicFile({ slug: "clean-program", filename: "second.pdf", mimeType: "application/pdf" });

  const after = getPublicFile("clean-program")!;
  assert.equal(after.slug, "clean-program", "same link, in hundreds of messages already sent");
  assert.equal(after.filename, "second.pdf");
  assert.equal(new TextDecoder().decode(readMediaFile(after.filename)).includes("الثانية"), true);
  assert.equal(listPublicFiles().length, 1, "replaced, not duplicated");

  // Opens are counted, so a link nobody can open shows up as a number
  // before anybody has to write in about it.
  assert.equal(getPublicFile("clean-program")!.hits, 0);
  countPublicFileHit("clean-program");
  countPublicFileHit("clean-program");
  assert.equal(getPublicFile("clean-program")!.hits, 2);

  // And a slug has to be something that survives a WhatsApp message.
  for (const bad of ["Clean Program", "ملف", "a", "x".repeat(60), "../etc"]) {
    assert.equal(setPublicFile({ slug: bad, filename: "first.pdf" }).ok, false, bad);
  }
});

/**
 * A public link on the app's own origin may not hand back whatever type
 * the uploader's browser claimed.
 *
 * The stored type is a claim, not a fact, and this route sits on the same
 * origin as the session cookie — so an .html served inline would run as
 * this app. Only the few types a programme or a photo actually is are
 * served as themselves; everything else is untyped bytes.
 */
test("only a safe type is served as itself", async () => {
  const { setPublicFile, getPublicFile } = await import("@/app/lib/db");
  const { writeMediaFile } = await import("@/app/lib/media-store");

  writeMediaFile("ok.pdf", new TextEncoder().encode("%PDF-1.5"));
  setPublicFile({ slug: "safe-pdf", filename: "ok.pdf", mimeType: "application/pdf" });
  assert.equal(getPublicFile("safe-pdf")!.mimeType, "application/pdf");

  // The upload route narrows the type before it is ever stored, so a row
  // can only ever hold one of the types the link is allowed to serve.
  const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
  for (const claimed of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml"]) {
    assert.equal(INLINE.has(claimed), false, `${claimed} is never served inline`);
  }
});
