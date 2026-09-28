import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { balanceSheet, incomeStatement } from "@/lib/services/accounting";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/v1/funds/{fund_id}/accounting/statements?from=&to= — 재무상태표(to 기준) + 손익계산서(from~to), 분개 기준
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/accounting/statements">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const to = DATE.test(p.get("to") ?? "") ? p.get("to")! : new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const from = DATE.test(p.get("from") ?? "") ? p.get("from")! : `${to.slice(0, 4)}-01-01`;
  const [balance_sheet, income_statement] = await Promise.all([balanceSheet(fund_id, to), incomeStatement(fund_id, from, to)]);
  return ok({ balance_sheet, income_statement });
});
