import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { dealStats } from "@/lib/services/deals";

// GET /api/v1/deals/stats — 단계별 건수, 단계별 평균 소요일, 드롭 사유 분포
export const GET = withUser(async () => ok(await dealStats()));
