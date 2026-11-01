/**
 * منتجات وخدمات أفكار.
 *
 * من شرح وسام 01.11. **مسار** = مرافقة بقواعدها · **إضافة** = منتَج
 * بينضاف. المنتسب بيقدر يحمل أكثر من واحد.
 *
 * ⬜ اللائحة رح توسّع، ولقدام لما يختار `clean` بتنعرض دفعات الـclean
 * المفتوحة (clean 15.11 …) ليختار منهن — هلق بينحفظ كملصق وبس.
 */
export type Product = { key: string; label: string; detail: string; kind: "path" | "addon" };

export const PRODUCTS: Product[] = [
  { key: "clean", label: "أسبوع كلين", detail: "الأكثر طلباً — الدفعة باسمها وتاريخها", kind: "path" },
  { key: "ocean-clean", label: "أوشن كلين", detail: "كلين + شيبر", kind: "path" },
  { key: "step", label: "مسار ستيب", detail: "مرافقة 3 أشهر مع أفكار", kind: "path" },
  { key: "extra", label: "مسار إكسترا", detail: "ستيب + أسبوع كلين خلال الـ3 أشهر + شيبر", kind: "path" },
  { key: "shaper", label: "شيبر", detail: "المكمّل الغذائي — بينشرى لحاله كمان", kind: "addon" }
];
