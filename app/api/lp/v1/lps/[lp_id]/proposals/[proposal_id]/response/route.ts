import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/handler";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpProposalResponseSchema } from "@/lib/schemas/proposal";
import { lpRespondProposal } from "@/lib/services/lp-portal";

// PUT …/proposals/{proposal_id}/response — LP 시스템의 출자 제안 응답 (🟢, D45)
// { "decision": "reviewing" | "committed" | "declined", "loc_amount"?, "decided_date"? }
// 같은 요청을 다시 보내면 결과가 같다 (changed: false). 확약·거절 후 다른 결정은 409 PROPOSAL_CLOSED
export const PUT = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/proposals/[proposal_id]/response">>(async (request, ctx) => {
  const { lp_id, proposal_id } = await ctx.params;
  const input = await parseBody(request, lpProposalResponseSchema);
  return ok(await lpRespondProposal(lp_id, proposal_id, input));
});
