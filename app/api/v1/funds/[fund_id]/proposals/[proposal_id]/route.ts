import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { updateProposalSchema } from "@/lib/schemas/proposal";
import { listProposals, updateProposal } from "@/lib/services/proposals";

// PATCH /api/v1/funds/{fund_id}/proposals/{proposal_id} — 금액·메모 수정 (확약 금액은 확약 상태에서만, BR-PROP-01)
export const PATCH = withUser<RouteContext<"/api/v1/funds/[fund_id]/proposals/[proposal_id]">>(async (request, ctx) => {
  const { fund_id, proposal_id } = await ctx.params;
  await updateProposal(fund_id, proposal_id, await parseBody(request, updateProposalSchema));
  return ok(await listProposals(fund_id));
});
