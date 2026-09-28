import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { conveneMeeting, getMeeting } from "@/lib/services/meetings";

// POST /api/v1/funds/{fund_id}/meetings/{meeting_id}/convene — 소집 (LP 조합원 전원에게 통지 + 연동 이벤트, BR-MTG-03)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]/convene">>(async (_request, ctx, user) => {
  const { fund_id, meeting_id } = await ctx.params;
  await conveneMeeting(fund_id, meeting_id, user.id);
  return ok(await getMeeting(fund_id, meeting_id));
});
