import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function member() {
  const { createMember } = await import("@/app/lib/db");
  seq += 1;
  return createMember({ name: `ليلى ${seq}`, phone: `+97252000${String(seq).padStart(4, "0")}` });
}

test("a meal plan is stored against the person and read back", async () => {
  const { savePersonFile, listPersonFiles, readPersonFileBytes } = await import("@/app/lib/person-files");
  const person = await member();

  const saved = savePersonFile({
    memberId: person.id,
    kind: "plan",
    label: "متكون أسبوع 1",
    originalName: "plan.pdf",
    mimeType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.4 meal plan"),
    note: "بعد الوزن الأول"
  });

  const files = listPersonFiles(person.id);
  assert.equal(files.length, 1);
  assert.equal(files[0].label, "متكون أسبوع 1");
  assert.equal(files[0].kind, "plan");
  assert.equal(files[0].sizeBytes, 18);
  assert.equal(files[0].url, `/api/files/${saved.filename}`);
  assert.equal(new TextDecoder().decode(readPersonFileBytes(saved.filename)), "%PDF-1.4 meal plan");
});

test("the label falls back to the uploaded file's own name", async () => {
  const { savePersonFile, listPersonFiles } = await import("@/app/lib/person-files");
  const person = await member();

  savePersonFile({
    memberId: person.id,
    kind: "other",
    label: "   ",
    originalName: "فحص دم.pdf",
    mimeType: "application/pdf",
    bytes: new Uint8Array([1, 2, 3])
  });

  assert.equal(listPersonFiles(person.id)[0].label, "فحص دم.pdf");
});

test("a stored name never escapes the files directory", async () => {
  const { savePersonFile } = await import("@/app/lib/person-files");
  const person = await member();

  const saved = savePersonFile({
    memberId: person.id,
    kind: "doc",
    label: "x",
    originalName: "../../etc/passwd",
    mimeType: "application/octet-stream",
    bytes: new Uint8Array([0])
  });

  assert.ok(!saved.filename.includes("/"), `got ${saved.filename}`);
  assert.ok(!saved.filename.includes(".."), `got ${saved.filename}`);
});

test("deleting a file takes the row and the bytes", async () => {
  const { savePersonFile, listPersonFiles, deletePersonFile, readPersonFileBytes } = await import("@/app/lib/person-files");
  const person = await member();

  const saved = savePersonFile({
    memberId: person.id,
    kind: "photo",
    label: "قبل",
    originalName: "before.jpg",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([255, 216, 255])
  });

  assert.equal(deletePersonFile(saved.id), true);
  assert.equal(listPersonFiles(person.id).length, 0);
  assert.throws(() => readPersonFileBytes(saved.filename));
  assert.equal(deletePersonFile(saved.id), false, "deleting twice is not an error, it is a no-op");
});

test("files reach the person's record and its timeline", async () => {
  const { savePersonFile } = await import("@/app/lib/person-files");
  const { getPersonRecord } = await import("@/app/lib/people");
  const person = await member();

  savePersonFile({
    memberId: person.id,
    kind: "plan",
    label: "متكون أسبوع 2",
    originalName: "w2.pdf",
    mimeType: "application/pdf",
    bytes: new Uint8Array([1])
  });

  const record = getPersonRecord(person.id)!;
  assert.equal(record.files.length, 1);
  assert.ok(
    record.timeline.some((entry) => entry.kind === "file" && entry.detail.includes("متكون أسبوع 2")),
    "an upload is something that happened to her, so it belongs in the stream"
  );
});

test("only a plan or a photo is served inline; anything else downloads", async () => {
  const { isInlineType } = await import("@/app/lib/person-file-kinds");

  assert.equal(isInlineType("application/pdf"), true, "the meal plan");
  assert.equal(isInlineType("image/jpeg"), true, "a before photo");
  assert.equal(isInlineType("IMAGE/PNG"), true, "however the browser spelled it");

  // A stored type is whatever the uploader's browser claimed, and an .html
  // served inline would run on this app's own origin, beside the cookie.
  assert.equal(isInlineType("text/html"), false);
  assert.equal(isInlineType("image/svg+xml"), false, "an SVG is a document that can script");
  assert.equal(isInlineType("application/xhtml+xml"), false);
});
