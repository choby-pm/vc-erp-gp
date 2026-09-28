import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { createProposalSchema } from "@/lib/schemas/proposal";
import { createProposal, listProposals } from "@/lib/services/proposals";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/proposals">;

// GET /api/v1/funds/{fund_id}/proposals — 출자 제안 목록 + 모집 달성률 (BR-PROP-04)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listProposals(fund_id));
});

// POST /api/v1/funds/{fund_id}/proposals — 출자 제안 작성 (기획·모집 중만, 조합당 출자자 1건)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await createProposal(fund_id, await parseBody(request, createProposalSchema), user.id);
  return ok(await listProposals(fund_id), 201);
});
