import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { agendaSchema } from "@/lib/schemas/meeting";
import { addAgenda, getMeeting } from "@/lib/services/meetings";

// POST /api/v1/funds/{fund_id}/meetings/{meeting_id}/agendas — 안건 추가 (소집 전만, 가결 기준 복사, BR-VOTE-04)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]/agendas">>(async (request, ctx, user) => {
  const { fund_id, meeting_id } = await ctx.params;
  await addAgenda(fund_id, meeting_id, await parseBody(request, agendaSchema), user.id);
  return ok(await getMeeting(fund_id, meeting_id), 201);
});
