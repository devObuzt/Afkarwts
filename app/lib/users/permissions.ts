/**
 * What a user is allowed to do.
 *
 * Until now there was one shared login and whoever had it could do
 * everything — read a member's illnesses, send to a cohort, delete a
 * contact. These are the capabilities that login was made of, named so they
 * can be handed out one at a time.
 *
 * Client-safe: no database, no node imports, because the users screen draws
 * the same list the server enforces.
 */

export const PERMISSIONS = [
  "people.view",
  "people.health",
  "people.edit",
  "people.delete",
  "files.view",
  "files.manage",
  "messages.send",
  "leads.review",
  "journeys.view",
  "journeys.manage",
  "templates.manage",
  "forms.manage",
  "users.manage"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionInfo = {
  key: Permission;
  label: string;
  detail: string;
  group: string;
  /** Marked so the users screen can warn before handing it out. */
  sensitive?: boolean;
};

export const PERMISSION_INFO: PermissionInfo[] = [
  {
    key: "people.view",
    label: "شوف الناس",
    detail: "الأسماء، التلفونات، المحادثات والدورات. بلاها المنظومة فاضية.",
    group: "الناس"
  },
  {
    key: "people.health",
    label: "شوف الإجابات الصحية",
    detail: "الأمراض، الأدوية، الحمل والرضاعة. معلومات طبية عن ناس حقيقيين — ما بتنعطى إلا للي بيبني المتكون.",
    group: "الناس",
    sensitive: true
  },
  {
    key: "people.edit",
    label: "عدّل بيانات وملاحظات",
    detail: "الاسم، البلد، والملاحظات على الكونتاكت.",
    group: "الناس"
  },
  {
    key: "people.delete",
    label: "امحي كونتاكت",
    detail: "بيشيل الشخص وكل محادثاته وتسجيلاته ومعاه. ما بينرجع.",
    group: "الناس",
    sensitive: true
  },
  {
    key: "files.view",
    label: "شوف الملفات",
    detail: "المتكونيم والفحوصات والصور المرفوعة على المشتركات.",
    group: "الملفات"
  },
  {
    key: "files.manage",
    label: "ارفع وامحي ملفات",
    detail: "رفع متكون أو فحص على ملف مشتركة، ومحوه.",
    group: "الملفات"
  },
  {
    key: "messages.send",
    label: "ابعت رسايل",
    detail: "رد حر أو قالب على الواتساب، باسم أفكار.",
    group: "الرسايل",
    sensitive: true
  },
  {
    key: "leads.review",
    label: "راجع التسجيلات",
    detail: "الموافقة على تسجيل جديد وإدخاله للمجموعة، أو رفضه.",
    group: "الدورات"
  },
  {
    key: "journeys.view",
    label: "شوف الدورات",
    detail: "وين وصلت كل دورة ومين فيها.",
    group: "الدورات"
  },
  {
    key: "journeys.manage",
    label: "شغّل ووقّف المسارات",
    detail: "تشغيل مسار، وقفه، وتعديل خطواته. هاد اللي بيقرر شو بينبعت لمئات الناس.",
    group: "الدورات",
    sensitive: true
  },
  {
    key: "templates.manage",
    label: "إدارة القوالب",
    detail: "إنشاء قالب وتقديمه لميتا، تجميد، ومجموعات.",
    group: "المكتبة"
  },
  {
    key: "forms.manage",
    label: "إدارة الاستمارات",
    detail: "بناء استمارة تسجيل، تعديل أسئلتها، وفتحها وتسكيرها.",
    group: "المكتبة"
  },
  {
    key: "users.manage",
    label: "إدارة المستخدمين",
    detail: "إضافة مستخدم، تغيير صلاحياته، وتعطيله. اللي عندو هاي بيقدر يعطي حالو أي إشي تاني.",
    group: "المنظومة",
    sensitive: true
  }
];

export const ROLES = ["owner", "assistant", "coach", "developer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "مالكة",
  assistant: "مساعِدة إدارية",
  coach: "مدرّبة / أخصائية",
  developer: "مطوّر"
};

export const ROLE_DETAIL: Record<Role, string> = {
  owner: "كل شي، وما بتنسحب منها ولا صلاحية.",
  assistant: "بتردّ وبتراجع التسجيلات وبتضيف ناس — بلا تشغيل مسارات، بلا محو، وبلا الإجابات الصحية.",
  coach: "بتشوف ملفات المشتركات بما فيها الصحي وبترفعلهن متكونيم — بلا تشغيل مسارات ولا إدارة قوالب.",
  developer: "كل شي ما عدا المحو، للصيانة."
};

/**
 * The preset a role starts from. It is a starting point, not a cage: every
 * permission is a checkbox on the user afterwards, which is what Wisam asked
 * for — «كل مستخدم نحددلو البيرمشنز تبعو».
 */
export const ROLE_PRESET: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  assistant: ["people.view", "people.edit", "files.view", "messages.send", "leads.review", "journeys.view"],
  coach: ["people.view", "people.health", "people.edit", "files.view", "files.manage", "messages.send", "journeys.view"],
  developer: [
    "people.view",
    "people.health",
    "people.edit",
    "files.view",
    "files.manage",
    "messages.send",
    "leads.review",
    "journeys.view",
    "journeys.manage",
    "templates.manage",
    "forms.manage",
    "users.manage"
  ]
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * An owner is never short a permission, whatever is stored on the row — a
 * mis-click on the users screen must not be able to lock the owner out of
 * the screen that would undo it.
 */
export function effectivePermissions(role: string, stored: string[]): Permission[] {
  if (role === "owner") {
    return [...PERMISSIONS];
  }
  return stored.filter(isPermission);
}

export function can(user: { role: string; permissions: string[] } | null, permission: Permission) {
  if (!user) {
    return false;
  }
  return effectivePermissions(user.role, user.permissions).includes(permission);
}
