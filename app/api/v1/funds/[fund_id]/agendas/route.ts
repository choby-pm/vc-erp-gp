import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { AGENDA_TYPES, type AgendaType } from "@/lib/labels";
import { listPassedAgendas } from "@/lib/services/terms";

// GET /api/v1/funds/{fund_id}/agendas?type=terms_amendment — 가결된 안건 목록 (규약 변경·운용 인력 교체·약정 증액의 근거 선택용)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/agendas">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const type = new URL(request.url).searchParams.get("type");
  if (!AGENDA_TYPES.includes(type as AgendaType)) throw new AppError(400, "VALIDATION_ERROR", "type 을 확인하세요");
  return ok(await listPassedAgendas(fund_id, type as AgendaType));
});
