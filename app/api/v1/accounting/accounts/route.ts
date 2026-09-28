import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { listAccounts } from "@/lib/services/accounting";

// GET /api/v1/accounting/accounts — 계정과목표 (모든 조합 공통, D35)
export const GET = withUser(async () => ok(await listAccounts()));
