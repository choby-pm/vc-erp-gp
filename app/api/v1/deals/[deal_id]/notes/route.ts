import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { dealNoteSchema } from "@/lib/schemas/deal";
import { addDealNote, getDeal } from "@/lib/services/deals";

type Ctx = RouteContext<"/api/v1/deals/[deal_id]/notes">;

// GET /api/v1/deals/{deal_id}/notes — 메모 목록 (최신순)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { deal_id } = await ctx.params;
  return ok((await getDeal(deal_id)).notes);
});

// POST /api/v1/deals/{deal_id}/notes — 메모 작성 (현재 단계가 함께 기록됨)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { deal_id } = await ctx.params;
  const { content } = await parseBody(request, dealNoteSchema);
  await addDealNote(deal_id, content, user.id);
  return ok((await getDeal(deal_id)).notes, 201);
});
