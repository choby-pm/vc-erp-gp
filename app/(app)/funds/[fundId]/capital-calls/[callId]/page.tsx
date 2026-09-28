import Link from "next/link";
import CapitalCallBoard from "@/components/capital-call-board";
import { formatDate } from "@/lib/format";
import { CALL_STATUS_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getCapitalCall } from "@/lib/services/capital-calls";
import { getFund } from "@/lib/services/funds";

export default async function CapitalCallDetailPage(props: PageProps<"/funds/[fundId]/capital-calls/[callId]">) {
  const { fundId, callId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const call = await loadOrNotFound(() => getCapitalCall(fundId, callId));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/funds/${fund.id}/capital-calls`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← 캐피탈콜 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">{call.is_initial ? "최초 납입 요청" : `제${call.call_no}차 캐피탈콜`}</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{CALL_STATUS_LABEL[call.status]}</span>
          <span className="text-sm text-slate-500">
            요청 {formatDate(call.call_date)} · 기한 {formatDate(call.due_date)}
            {call.purpose && ` · ${call.purpose}`}
          </span>
        </div>
      </div>
      <CapitalCallBoard fundId={fund.id} call={call} />
    </div>
  );
}
