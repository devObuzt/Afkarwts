import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { getMember } from "@/app/lib/db";
import { hebrewNameFor } from "@/app/lib/forms/hebrew-name";
import { paymentCandidates } from "@/app/lib/members/payment-match";
import { convertToMember } from "@/app/lib/members/convert";
import { PRODUCTS } from "@/app/lib/members/products";

export const runtime = "nodejs";

/** كل اللي بيلزم البوب-أب: الاسم المقترح، احتمالات الدفع، والمنتجات. */
export async function GET(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const member = getMember(Number(new URL(request.url).searchParams.get("memberId")));
  if (!member) {
    return NextResponse.json({ error: "هذا الشخص غير موجود." }, { status: 404 });
  }

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      stage: member.stage,
      // المحفوظ بيغلب الاقتراح — الأدمن صحّحه مرة، ما منرجع نخمّن فوقه.
      hebrewName: member.hebrewName || hebrewNameFor(member.name)
    },
    payments: paymentCandidates(member),
    products: PRODUCTS
  });
}

export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    memberId?: number;
    name?: string;
    hebrewName?: string;
    paid?: boolean;
    method?: number | null;
    paymentId?: number | null;
    products?: string[];
  };

  const result = convertToMember(
    {
      memberId: Number(body.memberId),
      name: body.name ?? "",
      hebrewName: body.hebrewName ?? "",
      paid: Boolean(body.paid),
      method: body.method ?? null,
      paymentId: body.paymentId ?? null,
      products: Array.isArray(body.products) ? body.products : []
    },
    auth.user.id
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.convert",
    subjectType: "member",
    subjectId: result.member.id,
    subjectLabel: `${result.member.name} · ${result.member.phone}`,
    detail: [
      result.labels.join(" + "),
      body.paid ? "دافع" : "غير دافع",
      result.linkedPayment ? "وانربطت دفعة من مورنينج" : ""
    ]
      .filter(Boolean)
      .join(" · ")
  });

  return NextResponse.json(result);
}
