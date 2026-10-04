"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AmountInput from "@/components/amount-input";

// 공고 지원 양식 (D47): 조합(기획 중 · 모집 중) · 부문 · 요청 출자액. 지원하면 그 기관 앞 출자 제안이 생기고 LP ERP에 알린다
// Idempotency-Key 로 두 번 눌러도 한 번만 지원된다
type Option = { id: string; label: string };

export default function LpCallApply({ programId, orgName, tracks, funds }: { programId: string; orgName: string; tracks: Option[]; funds: Option[] }) {
  const router = useRouter();
  const [v, setV] = useState({ fund_id: funds[0]?.id ?? "", track_id: tracks[0]?.id ?? "", amount: "", memo: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  if (funds.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">지원할 수 있는 조합(기획 중 · 모집 중)이 없습니다. 조합을 먼저 기획하세요.</p>;
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setErrors({});
        setMessage(null);
        const res = await fetch(`/api/v1/lp-calls/${programId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
          body: JSON.stringify({ fund_id: v.fund_id, track_id: v.track_id, proposed_amount: v.amount ? Number(v.amount) : null, memo: v.memo || null }),
        });
        const body = await res.json().catch(() => ({}));
        setPending(false);
        if (!res.ok) {
          key.current = crypto.randomUUID();
          setErrors(body.error?.details?.fields ?? {});
          setMessage({ tone: "error", text: body.error?.message ?? "지원하지 못했습니다" });
          return;
        }
        key.current = crypto.randomUUID();
        const d = body.data;
        setMessage(
          d.status === "sent"
            ? { tone: "ok", text: `${orgName}에 지원했습니다. 이 조합의 출자 제안에 "공고 지원"으로 들어갔습니다.` }
            : { tone: "warn", text: `지원은 저장했지만 ${orgName}에 접수되지 않았습니다 — ${d.error}. 출자 제안 화면에서 다시 보낼 수 있습니다.` },
        );
        router.refresh();
      }}
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{orgName}에 지원</h2>
        <p className="mt-0.5 text-xs text-slate-500">지원하면 이 조합에 {orgName} 앞 출자 제안이 생깁니다. 접수 기간은 {orgName}이(가) 지원을 받은 시각으로 봅니다.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">조합 (기획 중 · 모집 중)</span>
          <select value={v.fund_id} onChange={(e) => setV({ ...v, fund_id: e.target.value })} className={field}>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">모집 부문</span>
          <select value={v.track_id} onChange={(e) => setV({ ...v, track_id: e.target.value })} className={field}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {errors.track_id && <p className="mt-1 text-xs text-red-600">{errors.track_id}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">요청 출자액 (원)</span>
          <AmountInput value={v.amount} onChange={(amount) => setV({ ...v, amount })} invalid={Boolean(errors.proposed_amount)} placeholder="3,000,000,000" />
          {errors.proposed_amount && <p className="mt-1 text-xs text-red-600">{errors.proposed_amount}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">내부 메모 (선택)</span>
          <input value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} className={field} placeholder="예: 투심 자료 10/15 제출" />
        </label>
      </div>
      {message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : message.tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {pending ? "지원하는 중…" : "이 조합으로 지원"}
        </button>
      </div>
    </form>
  );
}
