import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { reopenFiscalYear } from "@/lib/services/accounting";

// POST /api/v1/funds/{fund_id}/accounting/closings/{fiscal_year}/reopen — 결산 재개 { reason } (결산 분개 역분개 + 잠금 해제, BR-ACC-07)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/accounting/closings/[fiscal_year]/reopen">>(async (request, ctx, user) => {
  const { fund_id, fiscal_year } = await ctx.params;
  const year = Number(fiscal_year);
  if (!Number.isInteger(year)) throw notFound("사업연도를");
  const { reason } = await parseBody(request, z.object({ reason: z.string({ error: "재개 사유를 입력하세요" }).trim().min(1, "재개 사유를 입력하세요").max(500) }));
  return ok(await reopenFiscalYear(fund_id, year, reason, user.id));
});
