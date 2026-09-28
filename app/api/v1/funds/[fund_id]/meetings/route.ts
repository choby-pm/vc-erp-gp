import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { createMeetingSchema } from "@/lib/schemas/meeting";
import { createMeeting, getMeeting, listMeetings } from "@/lib/services/meetings";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/meetings">;

// GET /api/v1/funds/{fund_id}/meetings — 총회 목록 + 지금 열 수 있는 총회 유형
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listMeetings(fund_id));
});

// POST /api/v1/funds/{fund_id}/meetings — 총회 생성 (결성·해산 안건은 자동 포함, 가결 기준 복사, BR-MTG-01, 02, BR-VOTE-04)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const meeting = await createMeeting(fund_id, await parseBody(request, createMeetingSchema), user.id);
  return ok(await getMeeting(fund_id, meeting.id), 201);
});
