import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { listLpCalls, listMyApplications } from "@/lib/services/lp-calls";

// GET /api/v1/lp-calls?strategy= — LP ERP 출자사업 공고 (게시판을 읽어 그대로) + 우리가 지원한 내역 (D47)
export const GET = withUser(async (request) => {
  const strategy = new URL(request.url).searchParams.get("strategy") ?? undefined;
  return ok({ items: await listLpCalls(strategy), applications: await listMyApplications() });
});
