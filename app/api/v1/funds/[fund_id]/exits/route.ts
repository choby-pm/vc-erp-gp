import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { exitSchema } from "@/lib/schemas/exit";
import { listExits, recordExit } from "@/lib/services/exits";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/exits">;

// GET /api/v1/funds/{fund_id}/exits — 회수 목록 + 합계 + 회수할 수 있는 보유 기업
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listExits(fund_id));
});

// POST /api/v1/funds/{fund_id}/exits — 회수 기록 (Idempotency-Key 필수, BR-EXIT-01~06). 투자자산 처분 분개를 함께 만든다
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => ok(await recordExit(fund_id, validateBody(body, exitSchema), user.id), 201));
});
