import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { listEvents, type EventStatus } from "@/lib/services/integration";

// GET /api/v1/integration-events?status= — 연동 이벤트 목록 + 상태별 건수 + 설정 여부
export const GET = withUser<RouteContext<"/api/v1/integration-events">>(async (request) => {
  const status = new URL(request.url).searchParams.get("status");
  return ok(await listEvents(["pending", "delivered", "failed"].includes(status ?? "") ? (status as EventStatus) : null));
});
