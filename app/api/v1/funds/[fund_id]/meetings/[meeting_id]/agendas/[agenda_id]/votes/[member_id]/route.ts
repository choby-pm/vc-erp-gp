import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { voteSchema } from "@/lib/schemas/meeting";
import { getMeeting, recordVote } from "@/lib/services/meetings";

// PUT /api/v1/funds/{fund_id}/meetings/{meeting_id}/agendas/{agenda_id}/votes/{member_id} — 투표 기록 { choice } (BR-VOTE-01, 02)
export const PUT = withUser<RouteContext<"/api/v1/funds/[fund_id]/meetings/[meeting_id]/agendas/[agenda_id]/votes/[member_id]">>(
  async (request, ctx, user) => {
    const { fund_id, meeting_id, agenda_id, member_id } = await ctx.params;
    const { choice } = await parseBody(request, voteSchema);
    await recordVote(fund_id, meeting_id, agenda_id, member_id, choice, user.id);
    return ok(await getMeeting(fund_id, meeting_id));
  },
);
