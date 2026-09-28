import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { updateDealSchema } from "@/lib/schemas/deal";
import { getDeal, updateDeal } from "@/lib/services/deals";

type Ctx = RouteContext<"/api/v1/deals/[deal_id]">;

// GET /api/v1/deals/{deal_id} — 상세 + 단계 이력 + 메모 + 같은 기업의 다른 딜
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { deal_id } = await ctx.params;
  return ok(await getDeal(deal_id));
});

// PATCH /api/v1/deals/{deal_id} — 단계 외 정보 수정 (종료 전만, BR-DEAL-02)
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { deal_id } = await ctx.params;
  await updateDeal(deal_id, await parseBody(request, updateDealSchema));
  return ok(await getDeal(deal_id));
});
