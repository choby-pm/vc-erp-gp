"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, percentToRatio, ratioToPercent } from "@/lib/format";
import type { TermsVersion } from "@/lib/services/terms";

// 규약 새 버전 작성: 가결된 규약 변경 안건을 근거로, 현재 조건을 채운 상태에서 바뀐 값만 고친다 (BR-TERM-02·03)

type Agenda = { id: string; title: string; meeting_date: string };
type RatioKey = "primary_purpose_min_ratio" | "gp_commitment_min_ratio" | "management_fee_rate" | "management_fee_rate_after" | "carry_rate" | "hurdle_rate" | "quorum_ratio";

const FIELDS: { key: RatioKey; label: string }[] = [
  { key: "primary_purpose_min_ratio", label: "주목적 의무 비율" },
  { key: "gp_commitment_min_ratio", label: "GP 의무 출자 비율" },
  { key: "management_fee_rate", label: "관리보수율 (투자 기간)" },
  { key: "management_fee_rate_after", label: "관리보수율 (투자 기간 후)" },
  { key: "carry_rate", label: "성과보수율" },
  { key: "hurdle_rate", label: "기준수익률" },
  { key: "quorum_ratio", label: "총회 가결 기준" },
];

export default function TermsAmendForm({ fundId, current, agendas }: { fundId: string; current: TermsVersion; agendas: Agenda[] }) {
  const router = useRouter();
  const [agendaId, setAgendaId] = useState(agendas[0]?.id ?? "");
  const agenda = agendas.find((a) => a.id === agendaId);
  const [effectiveDate, setEffectiveDate] = useState(agendas[0]?.meeting_date ?? "");
  const [purpose, setPurpose] = useState(current.primary_purpose);
  const [unit, setUnit] = useState(String(current.unit_amount));
  const [ratios, setRatios] = useState<Record<RatioKey, string>>(() => Object.fromEntries(FIELDS.map(({ key }) => [key, String(ratioToPercent(current[key]))])) as Record<RatioKey, string>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = FIELDS.filter(({ key }) => Number(ratios[key]) !== ratioToPercent(current[key])).map((f) => f.label);
  if (purpose !== current.primary_purpose) changed.push("주목적 투자 분야");
  if (toAmount(unit) !== current.unit_amount) changed.push("1좌 금액");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`규약 버전 ${current.version + 1}을 만들까요? (${formatDate(effectiveDate)}부터 적용)\n바뀌는 항목: ${changed.join(", ") || "없음"}`)) return;
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agenda_id: agendaId,
        effective_date: effectiveDate,
        primary_purpose: purpose,
        unit_amount: toAmount(unit),
        ...Object.fromEntries(FIELDS.map(({ key }) => [key, percentToRatio(Number(ratios[key]))])),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "저장하지 못했습니다");
      return;
    }
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">규약 변경 · 버전 {current.version + 1} 만들기</h2>
      <p className="mt-0.5 text-xs text-slate-500">현재 조건이 채워져 있습니다. 가결된 내용대로 바뀐 값만 고치세요. 안건 하나당 새 버전 하나입니다.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">근거 안건 (가결된 규약 변경 안건)</span>
          <select
            value={agendaId}
            onChange={(e) => {
              setAgendaId(e.target.value);
              const a = agendas.find((x) => x.id === e.target.value);
              if (a && effectiveDate < a.meeting_date) setEffectiveDate(a.meeting_date);
            }}
            className={input("agenda_id")}
          >
            {agendas.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.meeting_date)} · {a.title}
              </option>
            ))}
          </select>
          {errors.agenda_id && <p className="mt-1 text-xs text-red-600">{errors.agenda_id}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">적용일 (총회일 이후)</span>
          <input type="date" value={effectiveDate} min={agenda?.meeting_date} onChange={(e) => setEffectiveDate(e.target.value)} className={input("effective_date")} />
          {errors.effective_date && <p className="mt-1 text-xs text-red-600">{errors.effective_date}</p>}
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">주목적 투자 분야</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={input("primary_purpose")} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">1좌 금액 (원)</span>
          <AmountInput value={unit} onChange={setUnit} invalid={Boolean(errors.unit_amount)} />
          {errors.unit_amount && <p className="mt-1 text-xs text-red-600">{errors.unit_amount}</p>}
        </label>
        {FIELDS.map(({ key, label }) => {
          const diff = Number(ratios[key]) !== ratioToPercent(current[key]);
          return (
            <label key={key} className="block">
              <span className={`text-xs font-medium ${diff ? "text-indigo-700" : "text-slate-600"}`}>
                {label} {diff && `(현재 ${ratioToPercent(current[key])}%)`}
              </span>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={ratios[key]}
                  onChange={(e) => setRatios({ ...ratios, [key]: e.target.value })}
                  className={`${input(key)} pr-8 text-right tabular-nums ${diff ? "border-indigo-400 bg-indigo-50/40" : ""}`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 pt-1 text-sm text-slate-400">%</span>
              </div>
              {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
            </label>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-slate-600">바뀌는 항목: {changed.length ? <b className="text-indigo-700">{changed.join(", ")}</b> : "없음"}</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || !agendaId || !effectiveDate} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "저장 중…" : `버전 ${current.version + 1} 만들기`}
        </button>
      </div>
    </form>
  );
}
