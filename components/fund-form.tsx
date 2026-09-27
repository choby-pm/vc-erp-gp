"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRW, percentToRatio, ratioToPercent } from "@/lib/format";
import { FUND_TYPES, FUND_TYPE_LABEL, type FundType } from "@/lib/labels";
import type { FundDetail } from "@/lib/services/funds";

// 펀드 생성·수정 공용 폼. 비율은 화면에서 %로 입력받고 API에는 소수(0.02)로 보낸다

type TermKey =
  | "primary_purpose_min_ratio"
  | "gp_commitment_min_ratio"
  | "management_fee_rate"
  | "management_fee_rate_after"
  | "carry_rate"
  | "hurdle_rate"
  | "quorum_ratio";

const TERM_FIELDS: { key: TermKey; label: string; hint: string }[] = [
  { key: "primary_purpose_min_ratio", label: "주목적 의무 비율", hint: "약정 총액 중 주목적 분야에 투자해야 하는 최소 비율" },
  { key: "gp_commitment_min_ratio", label: "GP 의무 출자 비율", hint: "약정 총액 중 GP가 최소한 출자해야 하는 비율" },
  { key: "management_fee_rate", label: "관리보수율 (투자 기간)", hint: "연율, 약정 총액 기준" },
  { key: "management_fee_rate_after", label: "관리보수율 (투자 기간 후)", hint: "연율, 투자 잔액 기준" },
  { key: "carry_rate", label: "성과보수율", hint: "기준수익을 넘는 초과수익 중 GP 몫" },
  { key: "hurdle_rate", label: "기준수익률", hint: "성과보수를 받기 위해 넘어야 하는 연 수익률" },
  { key: "quorum_ratio", label: "총회 가결 기준", hint: "전체 의결권 대비 찬성 비율" },
];

// 새 펀드에 미리 채워두는 일반적인 예시값 (실제 규약에 맞게 수정)
const EXAMPLE_TERMS: Record<TermKey, number> = {
  primary_purpose_min_ratio: 60,
  gp_commitment_min_ratio: 1,
  management_fee_rate: 2,
  management_fee_rate_after: 1.5,
  carry_rate: 20,
  hurdle_rate: 7,
  quorum_ratio: 66.6667,
};

type Errors = Record<string, string>;

export default function FundForm({ fund }: { fund?: FundDetail }) {
  const router = useRouter();
  const isEdit = Boolean(fund);

  const [name, setName] = useState(fund?.name ?? "");
  const [fundType, setFundType] = useState<FundType>(fund?.fund_type ?? "venture");
  const [targetAmount, setTargetAmount] = useState(fund ? String(fund.target_amount) : "");
  const [termYears, setTermYears] = useState(fund ? String(fund.term_years) : "8");
  const [investmentYears, setInvestmentYears] = useState(fund ? String(fund.investment_period_years) : "4");
  const [primaryPurpose, setPrimaryPurpose] = useState(fund?.terms.primary_purpose ?? "");
  const [termPercents, setTermPercents] = useState<Record<TermKey, string>>(() => {
    const entries = TERM_FIELDS.map(({ key }) => [
      key,
      String(fund ? ratioToPercent(fund.terms[key]) : EXAMPLE_TERMS[key]),
    ]);
    return Object.fromEntries(entries) as Record<TermKey, string>;
  });

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const target = Number(targetAmount.replaceAll(",", ""));
  const toNumber = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function send(url: string, method: string, body: unknown, prefix: string) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return (await res.json()).data;
    const { error } = await res.json().catch(() => ({ error: {} }));
    const fields = (error?.details?.fields ?? {}) as Errors;
    setErrors((prev) => ({
      ...prev,
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [prefix + k, v])),
    }));
    throw new Error(error?.message ?? "저장하지 못했습니다");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const basic = {
      name,
      fund_type: fundType,
      target_amount: toNumber(targetAmount.replaceAll(",", "")),
      term_years: toNumber(termYears),
      investment_period_years: toNumber(investmentYears),
    };
    const terms = {
      primary_purpose: primaryPurpose,
      ...Object.fromEntries(
        TERM_FIELDS.map(({ key }) => {
          const p = toNumber(termPercents[key]);
          return [key, p === undefined ? undefined : percentToRatio(p)];
        }),
      ),
    };

    try {
      if (fund) {
        await send(`/api/v1/funds/${fund.id}`, "PATCH", basic, "fund.");
        await send(`/api/v1/funds/${fund.id}/terms/1`, "PUT", terms, "terms.");
        router.push(`/funds/${fund.id}`);
      } else {
        const created = await send("/api/v1/funds", "POST", { fund: basic, terms }, "");
        router.push(`/funds/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setFormError((err as Error).message);
      setSaving(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;
  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
    }`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">펀드명</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 그로스 1호 벤처투자조합" className={inputClass("fund.name")} />
            {fieldError("fund.name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">펀드 유형</span>
            <select value={fundType} onChange={(e) => setFundType(e.target.value as FundType)} className={inputClass("fund.fund_type")}>
              {FUND_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FUND_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {fieldError("fund.fund_type")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">목표 결성액 (원)</span>
            <input
              inputMode="numeric"
              value={targetAmount === "" ? "" : Number(targetAmount.replaceAll(",", "")).toLocaleString("ko-KR")}
              onChange={(e) => setTargetAmount(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="10,000,000,000"
              className={`${inputClass("fund.target_amount")} text-right tabular-nums`}
            />
            <p className="mt-1 text-xs text-slate-500">{target > 0 ? `= ${formatKRW(target)}` : "원 단위로 입력"}</p>
            {fieldError("fund.target_amount")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">존속 기간 (년)</span>
            <input type="number" min={1} value={termYears} onChange={(e) => setTermYears(e.target.value)} className={inputClass("fund.term_years")} />
            {fieldError("fund.term_years")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">투자 기간 (년)</span>
            <input type="number" min={1} value={investmentYears} onChange={(e) => setInvestmentYears(e.target.value)} className={inputClass("fund.investment_period_years")} />
            <p className="mt-1 text-xs text-slate-500">신규 투자가 가능한 기간. 존속 기간 이하</p>
            {fieldError("fund.investment_period_years")}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">규약 핵심 조건 (버전 1)</h2>
          {!isEdit && <p className="text-xs text-amber-700">일반적인 예시값이 채워져 있습니다. 실제 규약에 맞게 수정하세요.</p>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">주목적 투자 분야</span>
            <input value={primaryPurpose} onChange={(e) => setPrimaryPurpose(e.target.value)} placeholder="예: 업력 3년 이내 초기 창업기업" className={inputClass("terms.primary_purpose")} />
            {fieldError("terms.primary_purpose")}
          </label>
          {TERM_FIELDS.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={termPercents[key]}
                  onChange={(e) => setTermPercents((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`${inputClass(`terms.${key}`)} pr-8 text-right tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 pt-1 text-sm text-slate-400">%</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{hint}</p>
              {fieldError(`terms.${key}`)}
            </label>
          ))}
        </div>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "저장 중…" : isEdit ? "저장" : "펀드 만들기"}
        </button>
      </div>
    </form>
  );
}
