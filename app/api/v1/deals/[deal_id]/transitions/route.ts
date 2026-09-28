import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { dealTransitionSchema } from "@/lib/schemas/deal";
import { getDeal, transitionDeal } from "@/lib/services/deals";

// POST /api/v1/deals/{deal_id}/transitions — 단계 이동 { to_stage, drop_reason?, target_fund_id?, expected_amount? } (BR-DEAL-01~05)
export const POST = withUser<RouteContext<"/api/v1/deals/[deal_id]/transitions">>(async (request, ctx, user) => {
  const { deal_id } = await ctx.params;
  await transitionDeal(deal_id, await parseBody(request, dealTransitionSchema), user.id);
  return ok(await getDeal(deal_id));
});
