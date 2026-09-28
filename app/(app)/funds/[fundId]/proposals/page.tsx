import FundraisingProgress from "@/components/fundraising-progress";
import ProposalsBoard from "@/components/proposals-board";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { listLpOptions } from "@/lib/services/lps";
import { listProposals } from "@/lib/services/proposals";

export default async function FundProposalsPage(props: PageProps<"/funds/[fundId]/proposals">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const [data, lps] = await Promise.all([listProposals(fundId), listLpOptions()]);

  return (
    <div className="space-y-6">
      {fund.status === "planning" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          기획 중인 조합입니다. 제안을 미리 작성할 수 있지만, 발송은 조합 화면에서 <b>모집을 시작</b>한 뒤에 할 수 있습니다.
        </p>
      )}
      {!data.can_edit && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">결성 이후에는 출자 제안을 바꿀 수 없습니다. 기록만 조회합니다.</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">모집 달성률</h2>
        <p className="mt-0.5 text-xs text-slate-500">확약 금액 합 ÷ 목표 결성액. 확약은 결성 전 약속이며, 결성 때 조합원 명부에서 약정액으로 확정됩니다.</p>
        <div className="mt-4">
          <FundraisingProgress summary={data.summary} />
        </div>
      </section>

      <ProposalsBoard fundId={fund.id} data={data} lps={lps} />
    </div>
  );
}
