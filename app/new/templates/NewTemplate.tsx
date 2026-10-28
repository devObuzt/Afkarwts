"use client";

import { useState } from "react";
import { variables } from "../format";
import { Tip } from "./Tip";

type Button =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phoneNumber: string };

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function placeholders(text: string) {
  let max = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export function NewTemplate({
  onCreated,
  onError
}: {
  onCreated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ar");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Button[]>([]);
  const [examples, setExamples] = useState<string[]>([]);

  const params = placeholders(bodyText);
  const headerHasEmoji = EMOJI.test(headerText);
  const badName = name.length > 0 && !/^[a-z0-9_]+$/.test(name);

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          language,
          category,
          headerText,
          bodyText,
          footerText,
          buttons,
          bodyExamples: Array.from({ length: params }, (_, at) => examples[at] || "سارة")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "ميتا رفضت القالب.");
      }

      setOpen(false);
      setName("");
      setHeaderText("");
      setBodyText("");
      setFooterText("");
      setButtons([]);
      setExamples([]);
      await onCreated(
        payload.template?.dryRun
          ? "انبعت بالمحاكاة — ولا إشي وصل ميتا من هون."
          : `انبعت لميتا. حالته ${payload.template?.status ?? "PENDING"} — واللائحة هون بتبيّن لما يتغيّر.`
      );
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "ما قدرنا نبعت القالب.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="crmCard crmPad crmFilters">
        <button className="crmBtn primary" onClick={() => setOpen(true)} type="button">
          قالب جديد
        </button>
        <span className="crmNote" style={{ alignSelf: "center" }}>
          بينكتب هون، وميتا بتراجعه، وبيصير يستعمل بالمسار لما ينعتمد — عادةً بدقائق.
        </span>
      </div>
    );
  }

  return (
    <section className="crmCard" data-tone="olive">
      <header>
        <span className="crmDot" />
        <h2>قالب جديد</h2>
        <button className="crmBtn quiet spacer" onClick={() => setOpen(false)} type="button">
          إلغاء
        </button>
      </header>

      <div className="crmPad tplForm">
        <label className="crmField">
          <span>
            الاسم عند ميتا
            <Tip title="الاسم">
              قاعدة ميتا نفسها: حروف إنجليزية صغيرة وأرقام وشرطة سفلية — بلا مسافات وبلا عربي. ما بيشوفه
              حدا؛ هو كيف بينتنادى القالب وقت الإرسال. 🔴 <strong>اختاريه بعناية:</strong> لو ميتا رفضت
              القالب بسبب فئته، <strong>الاسم بيحترق</strong> — الفئة ما بتتغيّر بعدين، فالمحاولة التانية
              بدها اسم جديد.
            </Tip>
          </span>
          <input
            className="crmLtr"
            onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="clean_week1_morning_util"
            value={name}
          />
          {badName ? <span className="crmError">بس a-z و0-9 و_ مسموحين.</span> : null}
        </label>

        <label className="crmField">
          <span>
            اللغة
            <Tip title="اللغة">
              اللغة اللي ميتا بتسجّله تحتها. القالب بلغة وحدة بس — نفس الكلام بالعبري قالب تاني. قوالب
              أفكار كلها <code>ar</code>.
            </Tip>
          </span>
          <select onChange={(event) => setLanguage(event.target.value)} value={language}>
            <option value="ar">عربي (ar)</option>
            <option value="he">عبري (he)</option>
            <option value="en">إنجليزي (en)</option>
          </select>
        </label>

        <label className="crmField">
          <span>
            الفئة
            <Tip title="الفئة">
              <strong>خدمية (Utility)</strong> بتتابع إشي المنتسبة أصلاً جوّاه — تذكير، تحديث، خطوة جاية.
              بتوصل الكل. <strong>تسويقية (Marketing)</strong> بتعرض أو بتبيع؛ بتنحسب على سقف التسويق لكل
              شخص وميتا بتحجب جزء منها. 🔴 ستة من قوالب أفكار اسمهن <code>_util</code> وميتا مسجّلتهن
              MARKETING — وهاد لحاله سبب معظم الـ267 إرسالة الفاشلة. <strong>الفئة بتتحدد من شو بيعمل
              النص، مش من الاسم.</strong>
            </Tip>
          </span>
          <select
            onChange={(event) => setCategory(event.target.value as "UTILITY" | "MARKETING")}
            value={category}
          >
            <option value="UTILITY">خدمية — متابعة، تذكير، تحديث</option>
            <option value="MARKETING">تسويقية — عرض أو دعوة</option>
          </select>
        </label>

        <label className="crmField full">
          <span>
            الهيدر — سطر فوق الرسالة (اختياري)
            <Tip title="الهيدر">
              سطر واحد قصير، بيبين غامق فوق النص. 🔴 <strong>ما بياخد إيموجي</strong> — ميتا بترفض القالب
              وما بتقول ليش. خلّيه فاضي إلا إذا الرسالة فعلاً بدها عنوان.
            </Tip>
          </span>
          <input onChange={(event) => setHeaderText(event.target.value)} placeholder="أسبوع Clean" value={headerText} />
          {headerHasEmoji ? (
            <span className="crmError">
              هاد الإيموجي رح يخلّي القالب ينرفض. حطّيه بالنص، هناك الإيموجي مرحّب فيه.
            </span>
          ) : null}
        </label>

        <label className="crmField full">
          <span>
            الرسالة
            <Tip title="الرسالة">
              الكلام اللي بتقراه المنتسبة. اكتبي <code>{"{{1}}"}</code> محل اسمها والمنظومة بتعبّيه.
              الإيموجي عادي هون. 🔴 شغلة وحدة ممنوعة تماماً: شرح كود دخول أو تحقّق — ميتا بتقراها كقالب
              مصادقة، واللي ما بياخد نص حر، وبترفضها بكل الفئات.
            </Tip>
          </span>
          <textarea
            onChange={(event) => setBodyText(event.target.value)}
            placeholder="سلام {{1}} 👋 اليوم بلّشنا أسبوع Clean، وأنا معك خطوة بخطوة"
            rows={5}
            value={bodyText}
          />
          <span className="crmNote">
            {params
              ? `${variables(params)} — {{1}}…{{${params}}}`
              : "بلا متغيّرات — كل المنتسبات بيقروا نفس الكلام."}
          </span>
        </label>

        {params > 0 && (
          <div className="crmField full">
            <span>
              مثال لكل متغيّر
              <Tip title="الأمثلة">
                ميتا ما بتراجع قالب بلا قيمة مثال لكل <code>{"{{n}}"}</code>. بينشاف للمراجِع بس — المنتسبات
                دايماً بيشوفوا القيمة الحقيقية.
              </Tip>
            </span>
            <div className="tplExamples">
              {Array.from({ length: params }, (_, at) => (
                <input
                  key={at}
                  onChange={(event) => {
                    const next = [...examples];
                    next[at] = event.target.value;
                    setExamples(next);
                  }}
                  placeholder={at === 0 ? "سارة" : `{{${at + 1}}}`}
                  value={examples[at] ?? ""}
                />
              ))}
            </div>
          </div>
        )}

        <label className="crmField full">
          <span>
            الفوتر — سطر صغير تحت الرسالة (اختياري)
            <Tip title="الفوتر">
              سطر رمادي قصير تحت النص، نفسه للكل. ما بياخد متغيّرات. بينفع لإشي زي «للإلغاء ردّي stop».
            </Tip>
          </span>
          <input
            onChange={(event) => setFooterText(event.target.value)}
            placeholder="أفكار — Eat.Love.Fit"
            value={footerText}
          />
        </label>

        <div className="crmField full">
          <span>
            أزرار (اختياري)
            <Tip title="الأزرار">
              <strong>ردّ سريع</strong> بيبعت نصّه كجواب من المنتسبة — والجواب بيفتح نافذة الـ24 ساعة، وهي
              اللحظة اللي بيقدر فيها المسار يحكي بحرّية. <strong>رابط</strong> بيفتح صفحة. لحد ثلاثة أزرار،
              وكل واحد فيهن إشي زيادة بيقدر المراجِع يرفضه — فحطّي اللي بستاهل بس.
            </Tip>
          </span>

          {buttons.map((button, at) => (
            <div className="tplButton" key={at}>
              <select
                onChange={(event) => {
                  const type = event.target.value as Button["type"];
                  const next = [...buttons];
                  next[at] =
                    type === "URL"
                      ? { type, text: button.text, url: "" }
                      : type === "PHONE_NUMBER"
                        ? { type, text: button.text, phoneNumber: "" }
                        : { type, text: button.text };
                  setButtons(next);
                }}
                value={button.type}
              >
                <option value="QUICK_REPLY">ردّ سريع</option>
                <option value="URL">رابط</option>
                <option value="PHONE_NUMBER">اتصال</option>
              </select>
              <input
                onChange={(event) => {
                  const next = [...buttons];
                  next[at] = { ...button, text: event.target.value };
                  setButtons(next);
                }}
                placeholder="بدي العرض"
                value={button.text}
              />
              {button.type === "URL" ? (
                <input
                  className="crmLtr"
                  onChange={(event) => {
                    const next = [...buttons];
                    next[at] = { ...button, url: event.target.value } as Button;
                    setButtons(next);
                  }}
                  placeholder="https://…"
                  value={button.url}
                />
              ) : null}
              {button.type === "PHONE_NUMBER" ? (
                <input
                  className="crmLtr"
                  onChange={(event) => {
                    const next = [...buttons];
                    next[at] = { ...button, phoneNumber: event.target.value } as Button;
                    setButtons(next);
                  }}
                  placeholder="+972…"
                  value={button.phoneNumber}
                />
              ) : null}
              <button
                className="crmBtn quiet"
                onClick={() => setButtons(buttons.filter((_, index) => index !== at))}
                type="button"
              >
                شيليه
              </button>
            </div>
          ))}

          {buttons.length < 3 && (
            <button
              className="crmBtn quiet"
              onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}
              type="button"
            >
              ضيفي زر
            </button>
          )}
        </div>

        <div className="full crmFilters">
          {/* الإيموجي بالهيدر رفضة مضمونة، والرفضة بتحرق الاسم. الشاشة
              القديمة كانت بتحذّر وبتخلّيكي تبعتي — يعني بتعرفي شو رح يصير
              وبتدفعي تمنه. الزرّ بيرفض. */}
          <button
            className="crmBtn primary"
            disabled={busy || !name || !bodyText.trim() || badName || headerHasEmoji}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? "عم بنبعت لميتا…" : "ابعثيه للمراجعة"}
          </button>
          <span className="crmNote" style={{ alignSelf: "center" }}>
            {headerHasEmoji
              ? "شيلي الإيموجي من الهيدر أول — هيك ميتا بترفضه، والاسم بيحترق معه."
              : "ميتا بتجاوب بنفس الطلب: PENDING يعني فات على المراجعة، وأي إشي غيره يعني انرفض على الطاير بسبب اللي بيقوله."}
          </span>
        </div>
      </div>
    </section>
  );
}
