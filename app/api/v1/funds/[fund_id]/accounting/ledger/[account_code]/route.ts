import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { generalLedger } from "@/lib/services/accounting";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/v1/funds/{fund_id}/accounting/ledger/{account_code}?from=&to= — 계정별 원장 (기초 잔액 + 누적 잔액)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/accounting/ledger/[account_code]">>(async (request, ctx) => {
  const { fund_id, account_code } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const date = (k: string) => (DATE.test(p.get(k) ?? "") ? p.get(k) : null);
  return ok(await generalLedger(fund_id, account_code, date("from"), date("to")));
});
