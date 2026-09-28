import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { termsEffectiveAt } from "@/lib/services/terms";

// GET /api/v1/funds/{fund_id}/terms/effective?date=YYYY-MM-DD — 그 날짜에 적용되는 규약 (BR-TERM-04)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/terms/effective">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const date = new URL(request.url).searchParams.get("date") ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, "VALIDATION_ERROR", "date 는 YYYY-MM-DD 형식입니다");
  return ok(await termsEffectiveAt(fund_id, date));
});
