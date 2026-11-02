import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.OPT_OUT_SECRET = "test-opt-out-secret";
process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_WABA_ID = "test-waba";

test("التوكن بيرجّع الرقم، وما بينفع يتولّد لرقم غيره", async () => {
  const { issueOptOutToken, phoneFromOptOutToken } = await import("@/app/lib/members/opt-out-token");

  const token = issueOptOutToken("+972526805262");
  assert.equal(phoneFromOptOutToken(token), "972526805262");

  // نفس الرقم بأي شكل بيعطي نفس التوكن — الرابط القديم بيضل شغّال.
  assert.equal(issueOptOutToken("972-52-680-5262"), token);

  // بصمة مزوّرة، وبصمة رقم تاني، وتوكن مقطوع — كلهن مرفوضين.
  assert.equal(phoneFromOptOutToken(token.slice(0, -1) + "x"), null);
  assert.equal(phoneFromOptOutToken("OTcyNTAwMDAwMDAw.aaaaaaaaaaaaaaaa"), null);
  assert.equal(phoneFromOptOutToken("972526805262"), null, "رقم عريان بلا بصمة مرفوض");
  assert.equal(phoneFromOptOutToken(""), null);

  // التوكن مربوط بالسرّ: لو تغيّر، الروابط القديمة بتموت — موثّق بالمقصود.
  process.env.OPT_OUT_SECRET = "another-secret";
  assert.equal(phoneFromOptOutToken(token), null);
  process.env.OPT_OUT_SECRET = "test-opt-out-secret";
});

test("الطلب بيتسجّل ولا بيمحي الصف", async () => {
  const { createMember, getMember } = await import("@/app/lib/db");
  const { requestOptOut, undoOptOut, countOptedOut, listOptedOut, isOptedOut } = await import(
    "@/app/lib/members/opt-out"
  );

  const member = createMember({ name: "سجل", phone: "+972521110001" });
  const before = countOptedOut();

  const stopped = requestOptOut({ memberId: member.id, source: "link" });
  assert.ok(stopped?.optOutAt, "التاريخ انكتب");
  assert.equal(stopped?.optOutSource, "link");
  assert.equal(countOptedOut(), before + 1);
  assert.ok(getMember(member.id), "الصف لسّه موجود — الطلب مش محو");
  assert.ok(listOptedOut().some((row) => row.id === member.id));

  // الطلب الثاني ما بيحرّك التاريخ: أول مرة هي اللي بتهمّ.
  const first = stopped?.optOutAt;
  const again = requestOptOut({ memberId: member.id, source: "reply" });
  assert.equal(again?.optOutAt, first);
  assert.equal(again?.optOutSource, "link", "المصدر الأول بيضل");

  const back = undoOptOut(member.id, { userId: null, actor: "اختبار" });
  assert.equal(back?.optOutAt, null);
  assert.equal(isOptedOut(back!), false);
  assert.equal(countOptedOut(), before);
});

test("رابط لرقم مش عنا ما بيعمل صف جديد", async () => {
  const { requestOptOut } = await import("@/app/lib/members/opt-out");
  assert.equal(requestOptOut({ phone: "+972529999999", source: "link" }), null);
});

test("كلمة الإيقاف بتتعرّف، والفقرة اللي فيها «وقف» لأ", async () => {
  const { isStopRequest, isResumeRequest } = await import("@/app/lib/members/opt-out");

  for (const yes of ["وقفوا", "إيقاف", "ايقاف الرسائل", "الغاء الاشتراك", "STOP", "stop.", "להסיר", "ما بديش رسائل"]) {
    assert.equal(isStopRequest(yes), true, `«${yes}» لازم تتعرّف`);
  }

  // 🔑 المطابقة على كل النص: «وقف» جوّا كلام تاني مش طلب إيقاف، وإيقاف
  // الغلط بيوقف العروض عن زبونة فعلية.
  for (const no of [
    "ما بقدر أوقف الأكل بالليل شو أعمل",
    "بدي أوقف الكلين لأسبوع وبعدين أرجع",
    "وقفت عند الدكتورة واستنيت ساعة",
    "",
    "شكرا"
  ]) {
    assert.equal(isStopRequest(no), false, `«${no}» مش طلب إيقاف`);
  }

  assert.equal(isResumeRequest("ارجعوني"), true);
  assert.equal(isResumeRequest("رجعوا"), true);
  assert.equal(isResumeRequest("بدي ارجع للمسار بعد رمضان"), false);
});

test("«وقفوا» بالواتساب بتوقف، و«ارجعوني» بترجّع", async () => {
  const { handleWebhookPayload, buildIncomingPayload } = await import("@/app/lib/whatsapp-webhook");
  const { findMemberByPhone } = await import("@/app/lib/db");
  const { isOptedOut } = await import("@/app/lib/members/opt-out");

  await handleWebhookPayload(buildIncomingPayload({ phone: "972521110002", text: "وقفوا" }));
  const stopped = findMemberByPhone("+972521110002");
  assert.ok(stopped && isOptedOut(stopped), "الرد أوقف الرسائل");
  assert.equal(stopped?.optOutSource, "reply");

  await handleWebhookPayload(buildIncomingPayload({ phone: "972521110002", text: "ارجعوني" }));
  assert.equal(findMemberByPhone("+972521110002")?.optOutAt, null, "الوعد بالرجعة بيشتغل");
});

test("رسالة عادية ما بتوقف إشي", async () => {
  const { handleWebhookPayload, buildIncomingPayload } = await import("@/app/lib/whatsapp-webhook");
  const { findMemberByPhone } = await import("@/app/lib/db");

  await handleWebhookPayload(
    buildIncomingPayload({ phone: "972521110003", text: "مرحبا بدي أعرف عن الكلين الجديد" })
  );
  assert.equal(findMemberByPhone("+972521110003")?.optOutAt, null);
});

test("اللي أوقف ما بياخد قالب تسويقي، وبياخد قالب الخدمة", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { requestOptOut } = await import("@/app/lib/members/opt-out");
  const whatsapp = await import("@/app/lib/whatsapp");

  const member = createMember({ name: "منوقفة", phone: "+972521110004" });
  requestOptOut({ memberId: member.id, source: "link" });
  const stopped = (await import("@/app/lib/db")).getMember(member.id)!;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("message_templates")) {
      return new Response(
        JSON.stringify({
          data: [
            { name: "club_offer", status: "APPROVED", language: "ar", category: "MARKETING", components: [{ type: "BODY", text: "عرض" }] },
            { name: "clean_day1", status: "APPROVED", language: "ar", category: "UTILITY", components: [{ type: "BODY", text: "صباح الخير" }] }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => whatsapp.sendWhatsAppTemplate(stopped, { name: "club_offer", language: "ar" }),
      /تسويق/,
      "القالب التسويقي مرفوض"
    );

    const sent = await whatsapp.sendWhatsAppTemplate(stopped, { name: "clean_day1", language: "ar" });
    assert.ok(sent.messageId, "قالب المسار بينبعت");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ما منعرف التصنيف = ما منبعت", async () => {
  const { createMember, getMember } = await import("@/app/lib/db");
  const { requestOptOut } = await import("@/app/lib/members/opt-out");
  const whatsapp = await import("@/app/lib/whatsapp");

  const member = createMember({ name: "بلا تصنيف", phone: "+972521110005" });
  requestOptOut({ memberId: member.id, source: "link" });
  const stopped = getMember(member.id)!;

  const realFetch = globalThis.fetch;
  // 🔑 الفشل مقفول: لائحة القوالب بتيجي على الشبكة، وفشلها ما بيعني «ابعت».
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => whatsapp.sendWhatsAppTemplate(stopped, { name: "club_offer", language: "ar" }),
      /ما وصل من ميتا/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("تأكيد الإيقاف بينبعت للطلب اللي إجا بالواتساب وبس، ومرة وحدة", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { requestOptOut } = await import("@/app/lib/members/opt-out");
  const { decideAutoReply, STOPPED_KEY } = await import("@/app/lib/whatsapp/auto-reply");
  const { createMessage } = await import("@/app/lib/db");

  const byReply = createMember({ name: "بالرد", phone: "+972521110006" });
  requestOptOut({ memberId: byReply.id, source: "reply" });
  assert.equal(decideAutoReply(byReply.id)?.kind, "stopped");

  createMessage({ memberId: byReply.id, direction: "outgoing", body: "تم", status: "sent", sendKey: STOPPED_KEY });
  assert.notEqual(decideAutoReply(byReply.id)?.kind, "stopped", "مرة وحدة");

  // اللي كبس الرابط شاف التأكيد بالصفحة — فما بيستلم رسالة تأكيد بعدين.
  const byLink = createMember({ name: "بالرابط", phone: "+972521110007" });
  requestOptOut({ memberId: byLink.id, source: "link" });
  assert.notEqual(decideAutoReply(byLink.id)?.kind, "stopped");
});
