import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { LEDGER_ENTRY_TYPES, listLedger, type LedgerEntryType } from "@/lib/services/ledger";

// GET /api/v1/funds/{fund_id}/ledger?member_id=&entry_type= — 원장 조회 (최신순, 취소 행 포함)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/ledger">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const entryType = params.get("entry_type");
  return ok(
    await listLedger(fund_id, {
      member_id: params.get("member_id"),
      entry_type: LEDGER_ENTRY_TYPES.includes(entryType as LedgerEntryType) ? (entryType as LedgerEntryType) : null,
    }),
  );
});
