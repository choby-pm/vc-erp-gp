import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/handler";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpVotesSchema } from "@/lib/schemas/meeting";
import { lpVote } from "@/lib/services/lp-portal";

// PUT …/meetings/{meeting_id}/votes — LP 직접 투표 { votes: [{ agenda_id, choice }] } (🔵🟢, BR-VOTE-07)
// 소집 후 개최 처리 전까지 다시 보낼 수 있다. 응답은 그 총회의 안건과 내 투표
export const PUT = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/meetings/[meeting_id]/votes">>(async (request, ctx) => {
  const { lp_id, fund_id, meeting_id } = await ctx.params;
  const { votes } = await parseBody(request, lpVotesSchema);
  return ok(await lpVote(lp_id, fund_id, meeting_id, votes));
});
