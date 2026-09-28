import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { createReport, getReport, listReports } from "@/lib/services/reports";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/reports">;

const createSchema = z.object({
  period_type: z.enum(["monthly", "quarterly", "semiannual", "annual"], { error: "보고 주기를 선택하세요" }),
  year: z.number({ error: "연도를 입력하세요" }).int().min(2000).max(2100),
  period_no: z.number({ error: "기간을 선택하세요" }).int().min(1).max(12),
  gp_comment: z.string().trim().max(5000).nullish().transform((v) => (v ? v : null)),
});

// GET /api/v1/funds/{fund_id}/reports — 보고서 목록 (발행·정정 여부)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listReports(fund_id));
});

// POST /api/v1/funds/{fund_id}/reports — 초안 생성 { period_type, year, period_no } (결성 이후, 같은 기간 초안 1개, BR-RPT-01)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const report = await createReport(fund_id, await parseBody(request, createSchema), user.id);
  return ok(await getReport(fund_id, report.id), 201);
});
