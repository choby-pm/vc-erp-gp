import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { dispatchEventsExclusive } from "@/lib/services/integration";

// POST /api/v1/integration-events/dispatch — 대기 중인 이벤트를 지금 LP 시스템 웹훅으로 보낸다 (주기 작업과 같은 잠금, D41)
export const POST = withUser<RouteContext<"/api/v1/integration-events/dispatch">>(async () => ok(await dispatchEventsExclusive("manual")));
