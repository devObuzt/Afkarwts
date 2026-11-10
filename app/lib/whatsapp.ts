import { formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL } from "./media-store";
import { dryRunId, isLive } from "./outbound-guard";
import { templateHeaderUrl } from "./template-media";
import { displayName, phoneForWhatsApp, type Member } from "./db";
import { isOptedOut } from "./members/opt-out";
import { issueOptOutToken } from "./members/opt-out-token";

type WhatsAppSendResponse = {
  messages?: Array<{ id: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: {
      details?: string;
    };
    fbtrace_id?: string;
  };
};

type WhatsAppMediaInfo = {
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
  id: string;
};

export type OutboundMediaKind = "image" | "video" | "document" | "audio";
export const WHATSAPP_IMAGE_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_VIDEO_BYTES = 16 * 1024 * 1024;
export const WHATSAPP_AUDIO_BYTES = 16 * 1024 * 1024;

const audioMimeTypes = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"]);

const documentMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function whatsAppErrorMessage(payload: WhatsAppSendResponse, fallback: string) {
  const message = payload.error?.message;
  const details = payload.error?.error_data?.details;

  if (message && details) {
    return `${message}: ${details}`;
  }

  return message || fallback;
}

export async function sendWhatsAppText(member: Member, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  if (!isLive()) {
    return dryRunId();
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(member.phone),
      type: "text",
      text: {
        preview_url: false,
        body
      }
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `WhatsApp API failed with ${response.status}`);
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return messageId;
}

export type TemplateSendOptions = {
  name?: string;
  language?: string;
  bodyParams?: string[];
  /** Overrides the stored header image; normally left out. */
  headerImageUrl?: string | null;
};

/** Placeholder the UI writes into a template value to mean "this contact's name". */
export const NAME_TOKEN = "{{name}}";

/** Used when a contact has no usable name, since WhatsApp rejects empty values. */
export const NAME_FALLBACK = process.env.WHATSAPP_NAME_FALLBACK || "صديقنا";

/**
 * Contacts are stored with their full name; a greeting reads better with the
 * first name alone, and numbers-as-names (from the webhook) are not names.
 */
export function contactFirstName(member: Pick<Member, "name" | "phone">) {
  const name = (member.name ?? "").trim();
  if (!name || name === member.phone || /^[+\d\s()-]+$/.test(name)) {
    return NAME_FALLBACK;
  }
  return name.split(/\s+/)[0];
}

/** Swaps the name token for this contact's first name, leaving other values alone. */
export function fillNameToken(bodyParams: string[], member: Pick<Member, "name" | "phone">) {
  if (!bodyParams.some((param) => param.includes(NAME_TOKEN))) {
    return bodyParams;
  }
  const first = contactFirstName(member);
  return bodyParams.map((param) => param.split(NAME_TOKEN).join(first));
}

/**
 * Free text carries the same name token as a template value does, so the box
 * the UI writes and the template it was copied from read alike.
 */
export function fillNameInText(text: string, member: Pick<Member, "name" | "phone">) {
  if (!text.includes(NAME_TOKEN)) {
    return text;
  }
  return text.split(NAME_TOKEN).join(contactFirstName(member));
}

/**
 * Meta fills {{1}}, {{2}}… from the values we send, so the copy we keep for
 * ourselves is filled the same way. Otherwise the thread and the reports show
 * a raw template while the member received their own name.
 */
export function renderTemplateBody(body: string, params: string[]) {
  return params.reduce((text, value, index) => text.split(`{{${index + 1}}}`).join(value), body);
}

export async function sendWhatsAppTemplate(member: Member, options: TemplateSendOptions = {}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const templateName = options.name || process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = options.language || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const bodyParams = fillNameToken(options.bodyParams ?? [], member);

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  if (!templateName) {
    throw new Error("WHATSAPP_TEMPLATE_NAME is missing.");
  }

  // Guard: WhatsApp rejects a template whose {{n}} placeholders are unfilled
  // (error #132000). Fail here with a message the UI can actually show.
  let known: WhatsAppTemplate[] = [];
  let match: WhatsAppTemplate | undefined;
  if (options.name) {
    known = await listWhatsAppTemplates().catch(() => [] as WhatsAppTemplate[]);
    match = known.find((item) => item.name === options.name);
    if (match && match.paramCount !== bodyParams.length) {
      throw new Error(
        `This template needs ${match.paramCount} value${match.paramCount === 1 ? "" : "s"} ` +
          `for its {{1}}…{{${match.paramCount}}} placeholders, but ${bodyParams.length} were provided.`
      );
    }
  }

  // الحارس: اللي طلب يوقف الرسائل ما بياخد القوالب اللي عرضت عليه
  // الإيقاف.
  //
  // 🔑 **المعيار هو زر الهسرة نفسه، مش تصنيف ميتا.** ميتا مصنّفة ١٦
  // قالب من قوالب مسار الكلين كـMARKETING — وهي رسائل برنامج لزبونة
  // دافعة. لو الحارس اتكّل على التصنيف، كانت الزبونة اللي بنص الكلين
  // وكبست «إيقاف الرسائل» بتوقف عنها **رسائل برنامجها هي**. القالب
  // اللي حامل الزر هو بالتعريف القالب اللي الوعد بينطبق عليه، فهو
  // المعيار الدقيق الوحيد.
  //
  // والفشل مقفول: لائحة القوالب بتيجي من ميتا على الشبكة، وفشلها
  // بيرجّع لائحة فاضية. «ما بنعرف» معناها ما بنبعت — مش بنفترض إنه
  // بلا زر.
  if (isOptedOut(member)) {
    if (!match) {
      throw new Error(
        `${displayName(member)} طلبت إيقاف الرسائل، ومعلومات القالب «${templateName}» ما وصلت من ميتا — ` +
          "فما انبعت ولا إشي. جرّب كمان مرة، وإذا ضلّت المشكلة افحص الاتصال بميتا."
      );
    }
    if (match.optOutButtonIndex !== null) {
      throw new Error(
        `${displayName(member)} كبست «إيقاف الرسائل»، و«${templateName}» من القوالب اللي بتحمل هاد الزر. ` +
          "رسائل المسار والخدمة لسّه بتنبعت."
      );
    }
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: {
      code: templateLanguage
    }
  };

  // A template with an image header cannot be sent without the image.
  // Meta answers a missing one with «Parameter format does not match
  // format in the created template» (#132012) — a sentence that never
  // mentions a picture, which is why this cost an afternoon. The image
  // the template was approved with is the one that belongs there, so it
  // is attached from what we kept when the template was made.
  const components: Array<Record<string, unknown>> = [];
  const headerUrl = options.headerImageUrl ?? (templateName ? templateHeaderUrl(templateName) : null);
  if (headerUrl) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: headerUrl } }] });
  }

  if (bodyParams.length) {
    components.push({ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) });
  }

  // زر الهسرة بياخد توكن هاد الرقم. بينضاف هون لحاله عشان ولا محل
  // إرسال بالمنظومة يضطر يعرف عنه: أي قالب انضافله الزر بيضل يشتغل.
  if (match?.optOutButtonIndex !== null && match?.optOutButtonIndex !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(match.optOutButtonIndex),
      parameters: [{ type: "text", text: issueOptOutToken(member.phone) }]
    });
  }

  if (components.length) {
    template.components = components;
  }

  if (!isLive()) {
    return { messageId: dryRunId(), templateName, templateLanguage };
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(member.phone),
      type: "template",
      template
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `WhatsApp API failed with ${response.status}`);
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return {
    messageId,
    templateName,
    templateLanguage
  };
}

const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: 1000000
};

export type MessagingLimit = {
  dailyLimit: number;
  suggested: number;
  tier: string | null;
  quality: string | null;
  source: "meta" | "env";
};

let limitCache: { value: MessagingLimit; at: number } | null = null;

// Business-initiated conversation limit per 24h. Meta only exposes the tier on
// some accounts; when absent we fall back to WHATSAPP_DAILY_LIMIT (default 1000
// — the starting tier for verified businesses). Suggested default is 70%.
export async function getMessagingLimit(): Promise<MessagingLimit> {
  if (limitCache && Date.now() - limitCache.at < 60 * 60 * 1000) {
    return limitCache.value;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let tier: string | null = null;
  let quality: string | null = null;

  if (accessToken && wabaId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers?fields=id,messaging_limit_tier,quality_rating`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json()) as {
        data?: Array<{ id?: string; messaging_limit_tier?: string; quality_rating?: string }>;
      };
      const entry =
        payload.data?.find((item) => item.id === phoneNumberId) ?? payload.data?.[0];
      tier = entry?.messaging_limit_tier ?? null;
      quality = entry?.quality_rating ?? null;
    } catch {
      // keep fallback
    }
  }

  // An explicit WHATSAPP_DAILY_LIMIT is what the account actually has, and
  // it wins over the tier Meta reports. The tier field goes stale: it kept
  // reading the old number long after the account was raised, and the
  // screen then capped a 4,000-person send at the stale figure. Meta's
  // number is still used when nobody has stated one.
  const stated = Number(process.env.WHATSAPP_DAILY_LIMIT);
  const fromMeta = tier && TIER_LIMITS[tier] ? TIER_LIMITS[tier] : null;
  const dailyLimit = Number.isFinite(stated) && stated > 0 ? stated : (fromMeta ?? 1000);

  const value: MessagingLimit = {
    dailyLimit,
    suggested: Math.max(1, Math.floor(dailyLimit * 0.7)),
    tier,
    quality,
    source: Number.isFinite(stated) && stated > 0 ? "env" : fromMeta ? "meta" : "env"
  };

  limitCache = { value, at: Date.now() };
  return value;
}

export type WhatsAppTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  headerText: string | null;
  paramCount: number;
  hasMediaHeader: boolean;
  /**
   * القالب فيه زر رابط متغيّر على مسار الهسرة. لازم نعرف، لأن زر الرابط
   * المتغيّر **بدّه قيمة وقت الإرسال** وبلاها ميتا بترفض الرسالة كلها
   * (#132000) — فالقالب اللي انضافله الزر بيوقف يشتغل بهدوء لو الإرسال
   * ما عرف يحطّ التوكن.
   */
  optOutButtonIndex: number | null;
};

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
};

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
};

type TemplateListResponse = {
  data?: Array<{
    name?: string;
    status?: string;
    language?: string;
    category?: string;
    components?: TemplateComponent[];
  }>;
  paging?: { next?: string };
  error?: { message?: string };
};

function countBodyParams(text: string) {
  let max = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export async function listWhatsAppTemplates(
  options: { includeUnapproved?: boolean } = {}
): Promise<WhatsAppTemplate[]> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  if (!wabaId) {
    throw new Error("WHATSAPP_WABA_ID is missing. Add it to the environment to list templates.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const payload = (await response.json()) as TemplateListResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Template list failed with ${response.status}`);
  }

  const templates: WhatsAppTemplate[] = [];

  for (const item of payload.data ?? []) {
    if (!item.name || !item.language) {
      continue;
    }

    // Sending needs an approved template; the management screen needs to see
    // the ones still waiting or rejected, which is the whole point of it.
    if (!options.includeUnapproved && item.status !== "APPROVED") {
      continue;
    }

    const body = item.components?.find((component) => component.type === "BODY");
    const header = item.components?.find((component) => component.type === "HEADER");
    const bodyText = body?.text ?? "";
    const buttons = item.components?.find((component) => component.type === "BUTTONS")?.buttons ?? [];
    const optOutIndex = buttons.findIndex(
      (button) => button.type === "URL" && (button.url ?? "").includes("{{1}}") && (button.url ?? "").includes("/stop/")
    );

    templates.push({
      name: item.name,
      language: item.language,
      category: item.category ?? "",
      status: item.status ?? "",
      bodyText,
      headerText: header?.format === "TEXT" ? header.text ?? null : null,
      paramCount: countBodyParams(bodyText),
      hasMediaHeader: Boolean(header && header.format && header.format !== "TEXT"),
      optOutButtonIndex: optOutIndex >= 0 ? optOutIndex : null
    });
  }

  return templates;
}

export type NewTemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  /** `urlExample` إجباري لما الرابط فيه `{{1}}` — ميتا بترفض بلاه. */
  | { type: "URL"; text: string; url: string; urlExample?: string }
  | { type: "PHONE_NUMBER"; text: string; phoneNumber: string }
  /**
   * زر نسخ كود الكوبون.
   *
   * ⚠️ **الكود بينحدّد وقت الإرسال** حسب توثيق ميتا، وشكل البارامتر
   * **مش موثّق** بأي صفحة قدرنا نقراها. يعني قالب فيه هاد الزر ممكن
   * يحتاج بارامتر بالحمولة، وغيابه بيرجّع #132000 وبتفشل كل إرسالة.
   * لهيك: أول إرسالة لأي قالب فيه هاد الزر بتروح **لرقم وسام** وبتنقرا
   * النتيجة قبل أي حملة. والكود مكتوب بنص الرسالة كمان، فحتى لو الزر
   * ما اشتغل الكود بيوصل.
   */
  | { type: "COPY_CODE"; code: string };

export type NewTemplate = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  bodyText: string;
  headerText?: string;
  /**
   * مقبض صورة الهيدر من Resumable Upload API.
   *
   * ميتا ما بتقبل رابط صورة وقت إنشاء القالب — بدها الملف ينترفع أولاً
   * وبترجّع مقبض (`h`)، وهو اللي بينحط كـ`example.header_handle`.
   */
  headerImageHandle?: string;
  footerText?: string;
  buttons?: NewTemplateButton[];
  allowCategoryChange?: boolean;
  /** One example value per {{n}} in the body — Meta rejects a template without them. */
  bodyExamples?: string[];
};

type TemplateCreateResponse = {
  id?: string;
  status?: string;
  category?: string;
  error?: { message?: string; error_user_msg?: string; error_subcode?: number };
};

/**
 * Submits a template for review. Meta screens the text on the spot: a body
 * that reads as an access code comes back REJECTED in this same call however
 * it is categorised, because AUTHENTICATION templates take no free text. A
 * healthy submission answers PENDING.
 *
 * The name is burned by that rejection — a category cannot be changed later,
 * approved or not — so a second attempt needs a new name.
 */
export async function createWhatsAppTemplate(input: NewTemplate) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }
  if (!wabaId) {
    throw new Error("WHATSAPP_WABA_ID is missing.");
  }

  const components: Array<Record<string, unknown>> = [];

  if (input.headerImageHandle) {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [input.headerImageHandle] }
    });
  } else if (input.headerText?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: input.headerText.trim() });
  }

  const body: Record<string, unknown> = { type: "BODY", text: input.bodyText };
  if (input.bodyExamples?.length) {
    body.example = { body_text: [input.bodyExamples] };
  }
  components.push(body);

  if (input.footerText?.trim()) {
    components.push({ type: "FOOTER", text: input.footerText.trim() });
  }

  if (input.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((button) => {
        if (button.type === "URL") {
          // المثال بينبعت بس لما الرابط فيه متغيّر — ميتا بترفض مثالاً
          // على رابط ثابت، وبترفض رابطاً متغيّراً بلا مثال.
          return button.url.includes("{{1}}")
            ? { type: "URL", text: button.text, url: button.url, example: [button.urlExample ?? button.url.replace("{{1}}", "example")] }
            : { type: "URL", text: button.text, url: button.url };
        }
        if (button.type === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: button.text, phone_number: button.phoneNumber };
        }
        if (button.type === "COPY_CODE") {
          return { type: "COPY_CODE", example: button.code };
        }
        return { type: "QUICK_REPLY", text: button.text };
      })
    });
  }

  const payload = {
    name: input.name,
    language: input.language,
    category: input.category,
    allow_category_change: input.allowCategoryChange ?? true,
    components
  };

  if (!isLive()) {
    return { id: dryRunId("template"), status: "PENDING", category: input.category, dryRun: true };
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = (await response.json()) as TemplateCreateResponse;

  if (!response.ok) {
    const meta = result.error?.error_user_msg || result.error?.message || `Meta refused it (${response.status}).`;
    throw new Error(meta);
  }

  return { id: result.id ?? "", status: result.status ?? "PENDING", category: result.category ?? input.category, dryRun: false };
}

export function mediaKindFromMime(mimeType: string, byteLength = 0): OutboundMediaKind {
  if (mimeType.startsWith("image/") && byteLength <= WHATSAPP_IMAGE_BYTES) {
    return "image";
  }

  if ((mimeType === "video/mp4" || mimeType === "video/3gpp") && byteLength <= WHATSAPP_VIDEO_BYTES) {
    return "video";
  }

  if (audioMimeTypes.has(mimeType) && byteLength <= WHATSAPP_AUDIO_BYTES) {
    return "audio";
  }

  return "document";
}

export function validateOutboundMediaForWhatsApp(input: { mimeType: string; byteLength: number }) {
  if (input.mimeType === "video/quicktime") {
    return "MOV is not supported by WhatsApp Cloud API. Convert it to MP4 and keep it under 16 MB.";
  }

  if (input.mimeType === "video/mp4" || input.mimeType === "video/3gpp") {
    if (input.byteLength > WHATSAPP_VIDEO_BYTES) {
      return `This video is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports videos up to 16 MB.`;
    }

    return null;
  }

  if (input.mimeType === "image/jpeg" || input.mimeType === "image/png" || input.mimeType === "image/webp") {
    if (input.byteLength > WHATSAPP_IMAGE_BYTES) {
      return `This image is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports images up to 5 MB.`;
    }

    return null;
  }

  if (input.mimeType.startsWith("audio/")) {
    if (!audioMimeTypes.has(input.mimeType)) {
      return "This audio format is not supported by WhatsApp. Use MP3, M4A/AAC, OGG, or AMR.";
    }

    if (input.byteLength > WHATSAPP_AUDIO_BYTES) {
      return `This audio file is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports audio up to 16 MB.`;
    }

    return null;
  }

  if (documentMimeTypes.has(input.mimeType)) {
    if (input.byteLength > MAX_MEDIA_BYTES) {
      return `This file is ${formatBytes(input.byteLength)}. The maximum supported size is ${MAX_MEDIA_LABEL}.`;
    }

    return null;
  }

  return "This file type is not supported by WhatsApp Cloud API.";
}

export async function uploadWhatsAppMedia(input: { bytes: Uint8Array; mimeType: string; filename: string }) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  const formData = new FormData();
  formData.set("messaging_product", "whatsapp");
  const mediaBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;
  formData.set("file", new File([mediaBuffer], input.filename, { type: input.mimeType }));

  if (!isLive()) {
    return dryRunId();
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  const payload = (await response.json()) as WhatsAppSendResponse & { id?: string };

  if (!response.ok || !payload.id) {
    throw new Error(whatsAppErrorMessage(payload, `WhatsApp media upload failed with ${response.status}`));
  }

  return payload.id;
}

export async function sendWhatsAppMedia(input: {
  member: Member;
  mediaId: string;
  kind: OutboundMediaKind;
  caption?: string;
  filename?: string;
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  // WhatsApp does not support captions on audio messages.
  const mediaPayload: Record<string, string> = { id: input.mediaId };
  if (input.caption && (input.kind === "image" || input.kind === "video")) {
    mediaPayload.caption = input.caption;
  }
  if (input.kind === "document") {
    mediaPayload.filename = input.filename || "file";
    if (input.caption) {
      mediaPayload.caption = input.caption;
    }
  }

  if (!isLive()) {
    return dryRunId();
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(input.member.phone),
      type: input.kind,
      [input.kind]: mediaPayload
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(whatsAppErrorMessage(payload, `WhatsApp API failed with ${response.status}`));
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return messageId;
}

export async function getWhatsAppMediaInfo(mediaId: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = (await response.json()) as WhatsAppMediaInfo & { error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || `WhatsApp media lookup failed with ${response.status}`);
  }

  return payload;
}

export async function downloadWhatsAppMedia(mediaUrl: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`WhatsApp media download failed with ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * بترفع صورة لميتا وبترجّع مقبضها، عشان تنحط كهيدر بقالب جديد.
 *
 * ميتا ما بتقبل رابط صورة وقت إنشاء القالب — في مسار منفصل
 * (Resumable Upload API) على **معرّف التطبيق** مش على رقم الواتساب:
 * جلسة أولاً، وبعدها البايتات، والرد فيه `h` وهو المقبض.
 *
 * ⚠️ الترويسة هون `Authorization: OAuth <token>` مش `Bearer` — ميتا
 * بترفض `Bearer` على هاد المسار لحاله.
 */
export async function uploadTemplateHeaderImage(input: {
  bytes: Uint8Array;
  mimeType: string;
  appId?: string;
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const appId = input.appId || process.env.WHATSAPP_APP_ID;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }
  if (!appId) {
    throw new Error("WHATSAPP_APP_ID is missing — the resumable upload runs on the app, not the phone number.");
  }

  const start = await fetch(
    `https://graph.facebook.com/${apiVersion}/${appId}/uploads` +
      `?file_length=${input.bytes.byteLength}&file_type=${encodeURIComponent(input.mimeType)}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const session = (await start.json()) as { id?: string; error?: { message?: string } };
  if (!start.ok || !session.id) {
    throw new Error(session.error?.message || `فتح جلسة الرفع فشل (${start.status})`);
  }

  const upload = await fetch(`https://graph.facebook.com/${apiVersion}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": input.mimeType
    },
    body: Buffer.from(input.bytes)
  });
  const payload = (await upload.json()) as { h?: string; error?: { message?: string } };
  if (!upload.ok || !payload.h) {
    throw new Error(payload.error?.message || `رفع الصورة فشل (${upload.status})`);
  }

  return payload.h;
}
