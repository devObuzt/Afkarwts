/**
 * رابط صورة الهيدر لقوالب بتاخد صورتها من مكان عام بدل ملف مرفوع.
 *
 * 🔑 **ليش هاد موجود:** قالب بهيدر صورة بدّه الصورة **وقت كل إرسالة** —
 * ميتا بترد `#132012` بلاها، ورسالتها («Parameter format does not match»)
 * ما بتذكر صورة أبداً. والطريق الوحيد قبل اليوم كان رفع ملف من شاشة
 * القوالب — وهاي الشاشة **ما بتعرض الخيار أصلاً**، يعني قالب انعمل من
 * برا الواجهة كان بيضل ميت بهدوء.
 *
 * فالخريطة هون مكتوبة بالريبو بالمقصود: صريحة، بتنراجع بالكومِت،
 * وبتنشر مع الكود — بلا رفع وبلا كبسة. الرابط لازم يكون **عام** لأن
 * ميتا بتجيب الصورة بنفسها وبتوصل بلا أي كوكي إلنا.
 */
export const TEMPLATE_HEADER_URLS: Record<string, string> = {
  afkar_blackfriday_2026_img:
    "https://pub-e69fa12de91c4e0f8f9b7083da137878.r2.dev/lp/afkar_bf/bf-wa-header.jpg"
};

export function headerUrlFor(templateName: string) {
  return TEMPLATE_HEADER_URLS[templateName] ?? null;
}
