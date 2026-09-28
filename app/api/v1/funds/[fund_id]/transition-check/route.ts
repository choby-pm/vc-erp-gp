import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { FUND_STATUSES, type FundStatus } from "@/lib/labels";
import { checkTransition } from "@/lib/services/fund-transitions";

// GET /api/v1/funds/{fund_id}/transition-check?to={status} — 상태 이동 가능 여부 + 조건 체크리스트
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/transition-check">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const to = new URL(request.url).searchParams.get("to");
  if (!FUND_STATUSES.includes(to as FundStatus)) {
    throw new AppError(400, "VALIDATION_ERROR", "이동할 상태(to)를 확인하세요", undefined, { fields: { to: "올바른 조합 상태가 아닙니다" } });
  }
  return ok(await checkTransition(fund_id, to as FundStatus));
});
