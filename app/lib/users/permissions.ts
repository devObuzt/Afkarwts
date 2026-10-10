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
  "people.all",
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
  "income.view",
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
    label: "عرض المنتسبين",
    detail: "الأسماء وأرقام الهاتف والمحادثات والمسارات. بدونها تبدو المنظومة فارغة.",
    group: "المنتسبون"
  },
  {
    key: "people.all",
    label: "عرض كل المنتسبين",
    detail:
      "بدونها يرى المستخدم المنتسبين المسندين إليه فقط — وهي الطريقة التي تتابع بها مرافِقة مجموعتها دون غيرها.",
    group: "المنتسبون"
  },
  {
    key: "people.health",
    label: "عرض الإجابات الصحية",
    detail: "الأمراض والأدوية والحمل والرضاعة. معلومات طبية عن أشخاص حقيقيين، تُمنح لمن يبني البرنامج الغذائي فقط.",
    group: "المنتسبون",
    sensitive: true
  },
  {
    key: "people.edit",
    label: "تعديل البيانات والملاحظات",
    detail: "الاسم والبلدة والملاحظات المدوّنة على المنتسب.",
    group: "المنتسبون"
  },
  {
    key: "people.delete",
    label: "حذف منتسب",
    detail: "يحذف المنتسب ومعه كل محادثاته وتسجيلاته. لا يمكن التراجع.",
    group: "المنتسبون",
    sensitive: true
  },
  {
    key: "files.view",
    label: "عرض الملفات",
    detail: "البرامج الغذائية والفحوصات والصور المرفوعة على ملفات المنتسبين.",
    group: "الملفات"
  },
  {
    key: "files.manage",
    label: "رفع الملفات وحذفها",
    detail: "رفع برنامج غذائي أو فحص إلى ملف منتسب، وحذفه.",
    group: "الملفات"
  },
  {
    key: "messages.send",
    label: "إرسال الرسائل",
    detail: "رد حر أو قالب معتمد عبر واتساب، باسم أفكار.",
    group: "الرسائل",
    sensitive: true
  },
  {
    key: "leads.review",
    label: "مراجعة التسجيلات",
    detail: "الموافقة على تسجيل جديد وإدخاله إلى المجموعة، أو رفضه.",
    group: "المسارات"
  },
  {
    key: "journeys.view",
    label: "عرض المسارات",
    detail: "ما وصل إليه كل مسار ومن فيه.",
    group: "المسارات"
  },
  {
    key: "journeys.manage",
    label: "تشغيل المسارات وإيقافها",
    detail: "تشغيل مسار وإيقافه وتعديل خطواته. هذه الصلاحية تقرر ما يُرسل إلى مئات المنتسبين.",
    group: "المسارات",
    sensitive: true
  },
  {
    key: "templates.manage",
    label: "إدارة القوالب",
    detail: "إنشاء قالب وتقديمه إلى ميتا، وتجميده، وتنظيم المجموعات.",
    group: "المكتبة"
  },
  {
    key: "forms.manage",
    label: "إدارة الاستمارات",
    detail: "بناء استمارة تسجيل وتعديل أسئلتها وفتحها وإغلاقها.",
    group: "المكتبة"
  },
  {
    key: "income.view",
    label: "عرض الدخل",
    detail: "الفواتير المقبوضة ومجاميعها حسب المصدر ووسيلة الدفع والمسار. أرقام مالية.",
    group: "المنظومة",
    sensitive: true
  },
  {
    key: "users.manage",
    label: "إدارة المستخدمين",
    detail: "إضافة مستخدم وتغيير صلاحياته وتعطيله. من يملك هذه الصلاحية يستطيع منح نفسه أي صلاحية أخرى.",
    group: "المنظومة",
    sensitive: true
  }
];

export const ROLES = ["owner", "assistant", "coach", "developer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "مالك",
  assistant: "مساعد إداري",
  coach: "مدرّب / أخصائي تغذية",
  developer: "مطوّر"
};

export const ROLE_DETAIL: Record<Role, string> = {
  owner: "كل الصلاحيات، ولا تُسحب منه أي واحدة.",
  assistant: "بتردّ وبتمراجعة التسجيلات وبتضيف ناس — بلا تشغيل مسارات، بلا محو، وبلا الإجابات الصحية.",
  coach: "الاطّلاع على ملفات المنتسبين بما فيها الإجابات الصحية، ورفع البرامج الغذائية — بلا تشغيل مسارات ولا إدارة قوالب.",
  developer: "كل شي ما عدا المحو، للصيانة."
};

/**
 * The preset a role starts from. It is a starting point, not a cage: every
 * permission is a checkbox on the user afterwards, which is what Wisam asked
 * for — «كل مستخدم نحددلو البيرمشنز تبعو».
 */
export const ROLE_PRESET: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  assistant: ["people.view", "people.all", "people.edit", "files.view", "messages.send", "leads.review", "journeys.view"],
  coach: ["people.view", "people.health", "people.edit", "files.view", "files.manage", "messages.send", "journeys.view"],
  developer: [
    "people.view",
    "people.all",
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
    "income.view",
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
