import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { lpCallApplySchema } from "@/lib/schemas/proposal";
import { applyToLpCall } from "@/lib/services/lp-calls";

// POST /api/v1/lp-calls/{program_id}/apply — 공고 지원 { fund_id, track_id, proposed_amount, memo } (D47, Idempotency-Key 필수)
// 그 기관 앞 출자 제안을 "공고 지원"으로 만들고 LP ERP에 알린다. 응답 status: sent | rejected(LP가 거부, 이유) | failed(닿지 못함)
export const POST = withUser<RouteContext<"/api/v1/lp-calls/[program_id]/apply">>(async (request, ctx, user) => {
  const { program_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => ok(await applyToLpCall(program_id, validateBody(body, lpCallApplySchema), user.id), 201));
});
