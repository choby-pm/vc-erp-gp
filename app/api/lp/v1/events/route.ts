import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { eventsAfter } from "@/lib/services/lp-portal";

// GET /api/lp/v1/events?after={event_id}&limit=100 — 웹훅을 놓쳤을 때 이벤트를 순서대로 다시 받기 (05 API 설계 6-3)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/events">>(async (request) => {
  const params = new URL(request.url).searchParams;
  return ok(await eventsAfter(params.get("after"), Number(params.get("limit") ?? 100) || 100));
});
