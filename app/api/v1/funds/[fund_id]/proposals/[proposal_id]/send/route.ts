import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { listProposals, sendProposal } from "@/lib/services/proposals";

// POST /api/v1/funds/{fund_id}/proposals/{proposal_id}/send — 제안 발송 (통지 + 연동 이벤트, 모집 중만, BR-PROP-03)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/proposals/[proposal_id]/send">>(async (_request, ctx, user) => {
  const { fund_id, proposal_id } = await ctx.params;
  await sendProposal(fund_id, proposal_id, user.id);
  return ok(await listProposals(fund_id));
});
