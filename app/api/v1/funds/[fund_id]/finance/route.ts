import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import type { CashFlowKind } from "@/lib/labels";
import { getFinanceSummary, listCashFlows } from "@/lib/services/finance";

const KINDS: CashFlowKind[] = ["contribution", "investment", "management_fee", "expense", "exit", "distribution"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/v1/funds/{fund_id}/finance?from=&to=&kind= — 재무 요약 + 현금 흐름 장부 (누적 잔액 포함, D34)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/finance">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const date = (k: string) => (DATE.test(p.get(k) ?? "") ? p.get(k) : null);
  const kind = p.get("kind") as CashFlowKind | null;
  const [summary, cash] = await Promise.all([
    getFinanceSummary(fund_id),
    listCashFlows(fund_id, { from: date("from"), to: date("to"), kind: kind && KINDS.includes(kind) ? kind : null }),
  ]);
  return ok({ summary, ...cash });
});
