import { z } from "zod";
import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { createManualJournal, listJournal } from "@/lib/services/accounting";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/accounting/journal">;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const manualSchema = z.object({
  entry_date: z.string({ error: "분개일을 입력하세요" }).regex(DATE, "분개일은 YYYY-MM-DD 형식입니다"),
  description: z.string({ error: "적요를 입력하세요" }).trim().min(1, "적요를 입력하세요").max(200),
  lines: z
    .array(
      z.object({
        account: z.string().regex(/^\d{4}$/, "계정을 선택하세요"),
        debit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
        credit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
        memo: z.string().trim().max(200).nullish(),
      }),
    )
    .min(2, "분개 줄은 2개 이상이어야 합니다"),
});

// GET /api/v1/funds/{fund_id}/accounting/journal?from=&to= — 분개장 (최신순)
export const GET = withUser<Ctx>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const p = new URL(request.url).searchParams;
  const date = (k: string) => (DATE.test(p.get(k) ?? "") ? p.get(k) : null);
  return ok(await listJournal(fund_id, { from: date("from"), to: date("to") }));
});

// POST /api/v1/funds/{fund_id}/accounting/journal — 수동 분개 (차대 일치·열린 기간·거래일 현금, Idempotency-Key 필수, BR-ACC-04)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => ok(await createManualJournal(fund_id, validateBody(body, manualSchema), user.id), 201));
});
