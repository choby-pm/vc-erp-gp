import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { sendApplication } from "@/lib/services/lp-calls";

// POST /api/v1/funds/{fund_id}/proposals/{proposal_id}/send-application — 못 보낸 공고 지원을 LP ERP에 다시 보낸다 (D47)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/proposals/[proposal_id]/send-application">>(async (_request, ctx) =>
  ok(await sendApplication((await ctx.params).proposal_id)),
);
