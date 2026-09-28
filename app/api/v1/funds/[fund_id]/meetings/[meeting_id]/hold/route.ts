import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { holdMeeting, getMeeting } from "@/lib/services/meetings";

// POST /api/v1/funds/{fund_id}/meetings/{meeting_id}/hold — 개최 처리 (모든 안건 결과 확정·잠금 + 이벤트, BR-VOTE-03, 05, 06)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]/hold">>(async (_request, ctx) => {
  const { fund_id, meeting_id } = await ctx.params;
  await holdMeeting(fund_id, meeting_id);
  return ok(await getMeeting(fund_id, meeting_id));
});
