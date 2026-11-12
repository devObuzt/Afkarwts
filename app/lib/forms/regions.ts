/**
 * ترتيب البلاد لمسار التوصيل.
 *
 * الترتيب: **الشمال ← المركز ← الجنوب ← القدس والضفة** (قرار وسام
 * 12.11.2026)، وجوّا كل منطقة من الأقصى شمالاً نازل. هيك بينطابق مع
 * تقسيم شركتي التوصيل: وحدة بتغطّي الجليل والكرمل، والتانية المركز
 * والجنوب والقدس والضفة.
 *
 * 🔑 **البلد اللي مش بالقائمة بتنزل بالآخر، مش بتنحشر بمكان قريب.**
 * بلد بمكان غلط بمسار توصيل أسوأ من بلد بالآخر: الغلط بينمرّ بصمت،
 * والآخر بينشاف وبينتصلّح بسحبة.
 *
 * والترتيب هون **نقطة البداية مش الحكم** — بعد الكبسة بتسحب السطور
 * بإيدك وبيتحفظ سحبك فوقه.
 */

export type Region = "north" | "center" | "south" | "jerusalem";

export const REGION_LABEL: Record<Region, string> = {
  north: "الشمال",
  center: "المركز",
  south: "الجنوب",
  jerusalem: "القدس والضفة"
};

export const REGION_ORDER: Region[] = ["north", "center", "south", "jerusalem"];

type Town = { name: string; region: Region; aliases?: string[] };

/** البلاد بترتيب المسار جوّا كل منطقة. الإضافة هون وبس. */
export const TOWNS: Town[] = [
  // ── الشمال: الجليل الأعلى نازل للكرمل ووادي عارة ──
  { name: "البقيعة", region: "north", aliases: ["פקיעין"] },
  { name: "كفر ياسيف", region: "north", aliases: ["כפר יאסיף"] },
  { name: "أبو سنان", region: "north", aliases: ["אבו סנאן"] },
  { name: "جديدة المكر", region: "north", aliases: ["ג'דיידה מכר", "جديدة", "المكر"] },
  { name: "عكا", region: "north", aliases: ["עכו"] },
  { name: "دير الأسد", region: "north", aliases: ["דיר אל אסד"] },
  { name: "البعينة نجيدات", region: "north", aliases: ["בענה", "نجيدات", "البعنة"] },
  { name: "سخنين", region: "north", aliases: ["סח'נין", "סחנין"] },
  { name: "عرابة", region: "north", aliases: ["עראבה"] },
  { name: "مجد الكروم", region: "north", aliases: ["מג'ד אל כרום"] },
  { name: "كفر مندا", region: "north", aliases: ["כפר מנדא"] },
  { name: "بير المكسور", region: "north", aliases: ["ביר אל מכסור"] },
  { name: "شفاعمرو", region: "north", aliases: ["שפרעם"] },
  { name: "طمرة", region: "north", aliases: ["טמרה"] },
  { name: "المغار", region: "north", aliases: ["מע'אר", "מגאר"] },
  { name: "عزير", region: "north", aliases: ["עוזייר"] },
  { name: "كفر كنا", region: "north", aliases: ["כפר כנא", "كفركنا"] },
  { name: "الرينة", region: "north", aliases: ["ריינה"] },
  { name: "عين ماهل", region: "north", aliases: ["עין מאהל"] },
  { name: "الناصرة", region: "north", aliases: ["נצרת"] },
  { name: "يافة الناصرة", region: "north", aliases: ["יפיע", "يافة"] },
  { name: "عيلوط", region: "north", aliases: ["עילוט"] },
  { name: "نوف هجليل", region: "north", aliases: ["נוף הגליל", "نتسيرت عيليت"] },
  { name: "الناعورة", region: "north", aliases: ["נאעורה"] },
  { name: "الطيبة (المرج)", region: "north", aliases: ["טייבה זרעאל", "الطيبة الزعبية"] },
  { name: "بسمة طبعون", region: "north", aliases: ["בסמת טבעון"] },
  { name: "حيفا", region: "north", aliases: ["חיפה"] },
  { name: "جسر الزرقاء", region: "north", aliases: ["ג'סר א זרקא"] },
  { name: "قرية مشيرفة", region: "north", aliases: ["משירפה", "مشيرفة"] },
  { name: "مصمص", region: "north", aliases: ["מוסמוס"] },
  { name: "كفر قرع", region: "north", aliases: ["כפר קרע"] },
  { name: "باقة الغربية", region: "north", aliases: ["באקה אל גרביה", "باقة"] },
  { name: "جت", region: "north", aliases: ["ג'ת"] },
  { name: "حريش", region: "north", aliases: ["חריש"] },

  // ── المركز: المثلث وتل أبيب والسهل ──
  { name: "قلنسوة", region: "center", aliases: ["קלנסווה"] },
  { name: "الطيبة", region: "center", aliases: ["טייבה"] },
  { name: "الطيرة", region: "center", aliases: ["טירה"] },
  { name: "كفر قاسم", region: "center", aliases: ["כפר קאסם"] },
  { name: "رمات غان", region: "center", aliases: ["רמת גן"] },
  { name: "تل أبيب - يافا", region: "center", aliases: ["תל אביב", "תל אביב יפו", "تل ابيب", "يافا"] },
  { name: "اللد", region: "center", aliases: ["לוד"] },

  // ── الجنوب: النقب ──
  { name: "رهط", region: "south", aliases: ["רהט"] },
  { name: "شقيب السلام", region: "south", aliases: ["שגב שלום", "سجيب السلام"] },
  { name: "أبو قويدر", region: "south", aliases: ["אבו קוידר", "ابوقويدر"] },
  { name: "أبو تلول", region: "south", aliases: ["אבו תלול"] },

  // ── القدس والضفة ──
  { name: "طولكرم", region: "jerusalem", aliases: ["טולכרם"] },
  { name: "نابلس", region: "jerusalem", aliases: ["שכם"] },
  { name: "رام الله", region: "jerusalem", aliases: ["רמאללה"] },
  { name: "الجديرة", region: "jerusalem", aliases: ["جديرة", "ג'דירה"] },
  { name: "عين رافا", region: "jerusalem", aliases: ["עין ראפה"] },
  { name: "القدس", region: "jerusalem", aliases: ["ירושלים"] },
  { name: "بيت صفافا", region: "jerusalem", aliases: ["בית צפאפא"] }
];

/**
 * تسوية الاسم قبل المقارنة.
 *
 * الاسم بينكتب بعشر صيغ: «تل أبيب» و«تل ابيب»، «ג'סר א-זרקא» و«جسر
 * الزرقاء»، و«ال» بتيجي وبتروح. التسوية بتشيل الهمزات والتاء المربوطة
 * والمسافات والشحطات وأداة التعريف من **الطرفين** — فالمقارنة بتصير
 * على نفس الأرضية.
 */
export function normalizeTown(value: string) {
  let text = (value ?? "").trim().toLowerCase();
  text = text.replace(/[ً-ْـ]/g, "");
  text = text.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  text = text.replace(/["'’`\-–—()]/g, " ");
  text = text.replace(/\s+/g, "");
  text = text.replace(/^ال/, "");
  return text;
}

const INDEX = new Map<string, { region: Region; order: number }>();
TOWNS.forEach((town, order) => {
  for (const name of [town.name, ...(town.aliases ?? [])]) {
    INDEX.set(normalizeTown(name), { region: town.region, order });
  }
});

/** المنطقة ورقم البلد بالمسار، أو `null` لما ما نعرف البلد. */
export function placeOf(...names: Array<string | null | undefined>) {
  for (const name of names) {
    if (!name) {
      continue;
    }
    const hit = INDEX.get(normalizeTown(name));
    if (hit) {
      return hit;
    }
  }
  return null;
}

export type Placeable = { id: number; city: string; hebrewCity?: string };

/**
 * معرّفات السطور بترتيب المسار الرسمي.
 *
 * اللي بلا منطقة بينزلوا بالآخر، على ترتيبهم الحالي بينهم، وبينترجعوا
 * بأسمائهم عشان الشاشة تقدر تقول لمين لازم ينتبه.
 */
export function officialOrder(rows: Placeable[]) {
  const ranked: Array<{ id: number; region: number; order: number; at: number }> = [];
  const unplaced: number[] = [];
  const unknownTowns = new Set<string>();

  rows.forEach((row, at) => {
    const place = placeOf(row.city, row.hebrewCity);
    if (!place) {
      unplaced.push(row.id);
      unknownTowns.add((row.city || row.hebrewCity || "بلا بلد").trim());
      return;
    }
    ranked.push({ id: row.id, region: REGION_ORDER.indexOf(place.region), order: place.order, at });
  });

  ranked.sort((a, b) => a.region - b.region || a.order - b.order || a.at - b.at);

  return {
    ids: [...ranked.map((row) => row.id), ...unplaced],
    placed: ranked.length,
    unplaced: unplaced.length,
    unknownTowns: [...unknownTowns]
  };
}
