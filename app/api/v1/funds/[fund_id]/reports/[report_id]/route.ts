import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { deleteReportDraft, getReport, listReports, updateReportComment } from "@/lib/services/reports";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/reports/[report_id]">;

// GET — 초안이면 기간 종료일 기준 최신 숫자, 발행본이면 스냅샷 (BR-RPT-02)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, report_id } = await ctx.params;
  return ok(await getReport(fund_id, report_id));
});

// PATCH — GP 코멘트 수정 (초안만, BR-RPT-04)
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { fund_id, report_id } = await ctx.params;
  const { gp_comment } = await parseBody(request, z.object({ gp_comment: z.string().trim().max(5000).nullish().transform((v) => (v ? v : null)) }));
  await updateReportComment(fund_id, report_id, gp_comment);
  return ok(await getReport(fund_id, report_id));
});

// DELETE — 초안 삭제 (발행본은 삭제 불가)
export const DELETE = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, report_id } = await ctx.params;
  await deleteReportDraft(fund_id, report_id);
  return ok(await listReports(fund_id));
});
