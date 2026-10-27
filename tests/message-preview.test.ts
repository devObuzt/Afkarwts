import assert from "node:assert/strict";
import test from "node:test";
import { preview } from "../app/new/format";

/**
 * A list row has one line, and for a picture the stored body is the name of
 * the file behind it. Printed straight, the inbox read
 * «wamid.HBgMOTcy…jpg» where the message should have been.
 */
test("a picture with no caption reads as a picture, not as its file name", () => {
  const name = "wamid.HBgMOTcyNTIyNDQ2NjA0FQIAEhggQUNG.jpg";
  assert.equal(preview({ type: "image", body: name, filename: name }), "📷 صورة");
});

test("a caption is the message, and is kept", () => {
  assert.equal(
    preview({ type: "image", body: "هاي صورة الفطور", filename: "wamid.X.jpg" }),
    "📷 صورة · هاي صورة الفطور"
  );
});

test("a voice note is never given a caption — WhatsApp does not carry one", () => {
  assert.equal(preview({ type: "audio", body: "Voice message", filename: "x.ogg" }), "🎙️ رسالة صوتية");
});

test("the webhook's English stand-in is not mistaken for a caption", () => {
  assert.equal(preview({ type: "video", body: "Incoming video", filename: "y.mp4" }), "🎬 فيديو");
});

test("plain text is left exactly as it was written", () => {
  assert.equal(preview({ type: "text", body: "بنفع آكل برجر؟" }), "بنفع آكل برجر؟");
});

test("a message with no kind at all is still readable", () => {
  assert.equal(preview({ body: "مرحبا" }), "مرحبا");
});
