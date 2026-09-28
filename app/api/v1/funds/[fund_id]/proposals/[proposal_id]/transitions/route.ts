import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { proposalTransitionSchema } from "@/lib/schemas/proposal";
import { listProposals, transitionProposal } from "@/lib/services/proposals";

// POST /api/v1/funds/{fund_id}/proposals/{proposal_id}/transitions — 단계 이동 { to_status, loc_amount?, decided_date? } (BR-PROP-01, 02)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/proposals/[proposal_id]/transitions">>(async (request, ctx) => {
  const { fund_id, proposal_id } = await ctx.params;
  await transitionProposal(fund_id, proposal_id, await parseBody(request, proposalTransitionSchema));
  return ok(await listProposals(fund_id));
});
