import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { cancelMeeting, getMeeting } from "@/lib/services/meetings";

// POST /api/v1/funds/{fund_id}/meetings/{meeting_id}/cancel — 취소 (예정 상태만)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]/cancel">>(async (_request, ctx) => {
  const { fund_id, meeting_id } = await ctx.params;
  await cancelMeeting(fund_id, meeting_id);
  return ok(await getMeeting(fund_id, meeting_id));
});
