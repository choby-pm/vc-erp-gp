import FundTransitionButton from "@/components/fund-transition-button";
import { FUND_STATUS_LABEL } from "@/lib/labels";
import type { TransitionCheck } from "@/lib/services/fund-transitions";

// 다음 단계로 넘어가기 위한 조건 체크리스트 + 이동 버튼 (05 API 설계 4-4)
// 조건은 서버가 계산하고, 버튼을 눌렀을 때도 서버가 다시 검사한다

const ACTION: Record<string, { label: string; confirm: string; note: string }> = {
  fundraising: {
    label: "모집 시작",
    confirm: "모집을 시작할까요? 모집 중에는 출자 제안을 발송할 수 있고, 기획 단계로 되돌릴 수 없습니다.",
    note: "모집을 시작하면 출자 제안을 발송할 수 있습니다.",
  },
  formed: {
    label: "결성 처리",
    confirm: "조합을 결성할까요? 결성일은 결성총회일로 기록되고, 이후 규약·명부 변경은 총회 가결이 필요합니다.",
    note: "결성하면 결성일(= 결성총회일)부터 존속 기간과 투자 기간이 계산됩니다.",
  },
  operating: {
    label: "운용 시작",
    confirm: "운용을 시작할까요? 등록 정보는 더 이상 바꿀 수 없습니다.",
    note: "등록이 끝나면 운용을 시작해 투자를 집행할 수 있습니다.",
  },
};

export default function FundNextStep({ fundId, check }: { fundId: string; check: TransitionCheck }) {
  const action = ACTION[check.to_status];
  const done = check.conditions.filter((c) => c.met).length;

  return (
    <section className={`rounded-2xl border p-6 ${check.ready ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            다음 단계: {FUND_STATUS_LABEL[check.to_status]} <span className="text-sm font-normal text-slate-500">({done}/{check.conditions.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{action.note}</p>
        </div>
        {check.ready ? (
          <FundTransitionButton fundId={fundId} to={check.to_status} label={action.label} confirmMessage={action.confirm} />
        ) : (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-400">{action.label}</span>
        )}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm">
        {check.conditions.map((c) => (
          <li key={c.label} className="flex gap-2">
            <span className={c.met ? "text-emerald-600" : "text-slate-400"}>{c.met ? "✓" : "○"}</span>
            <span>
              <span className={c.met ? "text-slate-700" : "font-medium text-slate-900"}>{c.label}</span>
              {!c.met && c.hint && <span className="block text-xs text-slate-500">{c.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
