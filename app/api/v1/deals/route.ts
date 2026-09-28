import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { DEAL_STAGES, type DealStage } from "@/lib/labels";
import { createDealSchema } from "@/lib/schemas/deal";
import { createDeal, getDeal, listDeals } from "@/lib/services/deals";

const UUID = /^[0-9a-f-]{36}$/i;

// GET /api/v1/deals?stage=&owner_id=&fund_id= — 딜 목록 (칸반 보드는 이 목록을 단계별로 묶어 그린다)
export const GET = withUser(async (request) => {
  const p = new URL(request.url).searchParams;
  const stage = p.get("stage");
  const uuid = (key: string) => (UUID.test(p.get(key) ?? "") ? p.get(key) : null);
  return ok(await listDeals({ stage: DEAL_STAGES.includes(stage as DealStage) ? (stage as DealStage) : null, owner_id: uuid("owner_id"), fund_id: uuid("fund_id") }));
});

// POST /api/v1/deals — 딜 등록 (발굴 단계로 시작, 이력 기록)
export const POST = withUser(async (request, _ctx, user) => {
  const deal = await createDeal(await parseBody(request, createDealSchema), user.id);
  return ok(await getDeal(deal.id), 201);
});
