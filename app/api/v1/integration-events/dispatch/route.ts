import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { dispatchEvents } from "@/lib/services/integration";

// POST /api/v1/integration-events/dispatch — 대기 중인 이벤트를 지금 LP 시스템 웹훅으로 보낸다 (운영에서는 주기 작업이 호출)
export const POST = withUser<RouteContext<"/api/v1/integration-events/dispatch">>(async () => ok(await dispatchEvents()));
