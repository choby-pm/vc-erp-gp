import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { NOTICE_TYPES, type NoticeType } from "@/lib/labels";
import { noticeSchema } from "@/lib/schemas/notice";
import { createGeneralNotice, listNotices } from "@/lib/services/notices";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/notices">;

// GET /api/v1/funds/{fund_id}/notices?type= — 통지 목록 + LP별 확인 현황
export const GET = withUser<Ctx>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const type = new URL(request.url).searchParams.get("type");
  return ok(await listNotices(fund_id, NOTICE_TYPES.includes(type as NoticeType) ? (type as NoticeType) : null));
});

// POST — 일반 공지 초안 작성 { title, body, lp_ids? } (비우면 LP 조합원 전원)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return ok(await createGeneralNotice(fund_id, await parseBody(request, noticeSchema), user.id), 201);
});
