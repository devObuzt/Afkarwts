import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../app/lib/whatsapp/verify-signature";

const BODY = '{"entry":[{"changes":[{"value":{"messages":[]}}]}]}';
const sign = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

test("التوقيع الصح بيمرق", () => {
  process.env.WHATSAPP_APP_SECRET = "s3cr3t";
  assert.deepEqual(verifyMetaSignature(BODY, sign("s3cr3t", BODY)), { configured: true, valid: true });
});

test("توقيع بسرّ تاني بينرفض", () => {
  process.env.WHATSAPP_APP_SECRET = "s3cr3t";
  assert.equal(verifyMetaSignature(BODY, sign("wrong", BODY)).valid, false);
});

test("نفس التوقيع على جسم متغيّر بينرفض — ولو حرف", () => {
  process.env.WHATSAPP_APP_SECRET = "s3cr3t";
  const signature = sign("s3cr3t", BODY);
  assert.equal(verifyMetaSignature(`${BODY} `, signature).valid, false);
});

test("بلا ترويسة، أو بترويسة مش sha256، بينرفض", () => {
  process.env.WHATSAPP_APP_SECRET = "s3cr3t";
  assert.equal(verifyMetaSignature(BODY, null).valid, false);
  assert.equal(verifyMetaSignature(BODY, "sha1=abc").valid, false);
  assert.equal(verifyMetaSignature(BODY, "").valid, false);
});

/** السرّ ناقص = «ما قدرنا نتحقق»، مش «سليم». */
test("بلا سرّ مضبوط ما في تحقق أصلاً", () => {
  delete process.env.WHATSAPP_APP_SECRET;
  assert.deepEqual(verifyMetaSignature(BODY, sign("anything", BODY)), { configured: false, valid: false });
});
