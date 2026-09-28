import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getDashboard } from "@/lib/services/dashboard";

// GET /api/v1/dashboard — 전체 조합 요약 + 모든 경고 모음 + 다가오는 일정
export const GET = withUser<RouteContext<"/api/v1/dashboard">>(async () => ok(await getDashboard()));
