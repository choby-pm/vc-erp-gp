"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { DEAL_NEXT, DEAL_STAGE_LABEL, FUND_STATUS_LABEL, type DealStage, type FundStatus } from "@/lib/labels";
import type { DealDetail } from "@/lib/services/deals";

// 딜 상세의 조작 영역: 단계 이동(드롭 사유·투자 확정 조건 입력), 정보 수정, 메모 작성

type Option = { id: string; name: string };
type Errors = Record<string, string>;

function useApi(dealId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  async function call(method: string, path: string, body: unknown) {
    setBusy(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/deals/${dealId}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "처리하지 못했습니다");
      return false;
    }
    router.refresh();
    return true;
  }
  return { call, busy, errors, error };
}

const input = (invalid?: boolean) =>
  `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${invalid ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

export function DealActions({ deal, funds }: { deal: DealDetail; funds: (Option & { status: FundStatus })[] }) {
  const { call, busy, errors, error } = useApi(deal.id);
  const [mode, setMode] = useState<"drop" | "approve" | "ic" | null>(null);
  const [reason, setReason] = useState("");
  const [fundId, setFundId] = useState(deal.target_fund_id ?? "");
  const [amount, setAmount] = useState(deal.expected_amount ? String(deal.expected_amount) : "");
  const [notice, setNotice] = useState<string | null>(null);
  const next = DEAL_NEXT[deal.stage];
  if (next.length === 0) return null;

  // BR-DEAL-07: 투심위는 메모 1건 이상 + 예상 금액. 메모가 없으면 안내하고, 금액만 없으면 입력받는다
  const move = (to: DealStage) => {
    setNotice(null);
    if (to === "ic" && deal.notes.length === 0) {
      setNotice(`투심위에 올리려면 딜 메모가 1건 이상 필요합니다${deal.expected_amount ? "" : " (예상 투자 금액도 필요)"}. 아래 메모 칸에 검토 내용을 먼저 작성하세요.`);
      return;
    }
    if (to === "ic" && !deal.expected_amount) {
      setMode("ic");
      return;
    }
    call("POST", "/transitions", { to_stage: to });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">단계 이동</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {next
          .filter((s) => s !== "dropped" && s !== "approved")
          .map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => move(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
                s === "reviewing" && deal.stage === "ic" ? "border border-amber-300 text-amber-800 hover:bg-amber-50" : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {s === "reviewing" && deal.stage === "ic" ? "검토로 되돌리기 (보완 요청)" : `${DEAL_STAGE_LABEL[s]} 단계로`}
            </button>
          ))}
        {next.includes("approved") && (
          <button type="button" onClick={() => setMode("approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
            투자 확정
          </button>
        )}
        <button type="button" onClick={() => setMode("drop")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">
          드롭
        </button>
      </div>

      {mode === "drop" && (
        <div className="mt-4 rounded-xl bg-rose-50/50 p-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">드롭 사유 (필수)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 밸류에이션 이견" className={input(Boolean(errors.drop_reason))} />
            {errors.drop_reason && <p className="mt-1 text-xs text-red-600">{errors.drop_reason}</p>}
          </label>
          <p className="mt-2 text-xs text-slate-500">드롭하면 되돌릴 수 없습니다. 다시 검토하려면 새 딜을 만듭니다.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="text-sm text-slate-500">
              취소
            </button>
            <button type="button" disabled={busy} onClick={() => call("POST", "/transitions", { to_stage: "dropped", drop_reason: reason })} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
              드롭 확정
            </button>
          </div>
        </div>
      )}

      {mode === "approve" && (
        <div className="mt-4 rounded-xl bg-emerald-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">투자 예정 조합</span>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={input(Boolean(errors.target_fund_id))}>
                <option value="">선택하세요</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({FUND_STATUS_LABEL[f.status]})
                  </option>
                ))}
              </select>
              {errors.target_fund_id && <p className="mt-1 text-xs text-red-600">{errors.target_fund_id}</p>}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">예상 투자 금액</span>
              <AmountInput value={amount} onChange={setAmount} invalid={Boolean(errors.expected_amount)} />
              {errors.expected_amount && <p className="mt-1 text-xs text-red-600">{errors.expected_amount}</p>}
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">투자 확정 후 조합이 운용 중이면 투자를 집행할 수 있습니다 (R4-2).</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="text-sm text-slate-500">
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => call("POST", "/transitions", { to_stage: "approved", target_fund_id: fundId || null, expected_amount: toAmount(amount) })}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              투자 확정
            </button>
          </div>
        </div>
      )}
      {mode === "ic" && (
        <div className="mt-4 rounded-xl bg-indigo-50/50 p-4">
          <label className="block sm:w-1/2">
            <span className="text-xs font-medium text-slate-600">예상 투자 금액 (투심위 상정에 필수)</span>
            <AmountInput value={amount} onChange={setAmount} invalid={Boolean(errors.expected_amount)} autoFocus />
            {errors.expected_amount && <p className="mt-1 text-xs text-red-600">{errors.expected_amount}</p>}
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="text-sm text-slate-500">
              취소
            </button>
            <button
              type="button"
              disabled={busy || !toAmount(amount)}
              onClick={() => call("POST", "/transitions", { to_stage: "ic", expected_amount: toAmount(amount) })}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              투심위로 옮기기
            </button>
          </div>
        </div>
      )}
      {notice && <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {deal.stage === "reviewing" && (
        <p className="mt-3 text-xs text-slate-500">
          투심위 상정 조건: 딜 메모 {deal.notes.length > 0 ? "✓" : "○"} · 예상 투자 금액 {deal.expected_amount ? "✓" : "○"}
        </p>
      )}
    </section>
  );
}

export function DealInfoForm({ deal, owners, funds }: { deal: DealDetail; owners: Option[]; funds: (Option & { status: FundStatus })[] }) {
  const { call, busy, errors, error } = useApi(deal.id);
  const [values, setValues] = useState({
    owner_id: deal.owner_id,
    target_fund_id: deal.target_fund_id ?? "",
    expected: deal.expected_amount ? String(deal.expected_amount) : "",
    sourced_date: deal.sourced_date,
  });
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const ok = await call("PATCH", "", {
      owner_id: values.owner_id,
      target_fund_id: values.target_fund_id || null,
      expected_amount: toAmount(values.expected),
      sourced_date: values.sourced_date,
    });
    setSaved(ok);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">딜 정보</h2>
      <div className="mt-3 grid gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">담당자</span>
          <select value={values.owner_id} onChange={(e) => setValues({ ...values, owner_id: e.target.value })} className={input(Boolean(errors.owner_id))}>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">투자 예정 조합</span>
          <select value={values.target_fund_id} onChange={(e) => setValues({ ...values, target_fund_id: e.target.value })} className={input(Boolean(errors.target_fund_id))}>
            <option value="">아직 정하지 않음</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {errors.target_fund_id && <p className="mt-1 text-xs text-red-600">{errors.target_fund_id}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">예상 투자 금액</span>
          <AmountInput value={values.expected} onChange={(v) => setValues({ ...values, expected: v })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">발굴일</span>
          <input type="date" value={values.sourced_date} onChange={(e) => setValues({ ...values, sourced_date: e.target.value })} className={input()} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-700">저장했습니다</span>}
        <button type="button" disabled={busy} onClick={save} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          저장
        </button>
      </div>
    </section>
  );
}

export function DealNoteForm({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const { call, busy, error } = useApi(dealId);
  const [content, setContent] = useState("");
  return (
    <div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder={`${DEAL_STAGE_LABEL[stage]} 단계 메모 (GP 내부용, LP 비공개)`} className={input()} />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={busy || !content.trim()}
          onClick={async () => (await call("POST", "/notes", { content })) && setContent("")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          메모 추가
        </button>
      </div>
    </div>
  );
}
