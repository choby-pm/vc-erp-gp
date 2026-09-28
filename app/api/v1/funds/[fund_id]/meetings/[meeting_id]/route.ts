import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { updateMeetingSchema } from "@/lib/schemas/meeting";
import { getMeeting, updateMeeting } from "@/lib/services/meetings";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]">;

// GET /api/v1/funds/{fund_id}/meetings/{meeting_id} — 상세 (안건별 찬반 집계, 조합원 의결권)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, meeting_id } = await ctx.params;
  return ok(await getMeeting(fund_id, meeting_id));
});

// PATCH /api/v1/funds/{fund_id}/meetings/{meeting_id} — 일정·장소 수정 (예정 + 소집 전만)
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { fund_id, meeting_id } = await ctx.params;
  await updateMeeting(fund_id, meeting_id, await parseBody(request, updateMeetingSchema));
  return ok(await getMeeting(fund_id, meeting_id));
});
