import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { retryEvent } from "@/lib/services/integration";

// POST /api/v1/integration-events/{event_id}/retry — 실패 이벤트 재전송 (대기로 되돌림, BR-EVT-03)
export const POST = withUser<RouteContext<"/api/v1/integration-events/[event_id]/retry">>(async (_request, ctx) => {
  const { event_id } = await ctx.params;
  await retryEvent(event_id);
  return ok({ retried: true });
});
