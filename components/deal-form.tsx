"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { FUND_STATUS_LABEL, type FundStatus } from "@/lib/labels";

// 딜 등록: 기존 기업을 고르거나 새 기업을 함께 등록한다

type Option = { id: string; name: string };
type Errors = Record<string, string>;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function DealForm({
  companies,
  owners,
  funds,
  defaultCompanyId,
  defaultOwnerId,
}: {
  companies: (Option & { sector: string | null })[];
  owners: (Option & { position: string | null })[];
  funds: (Option & { status: FundStatus })[];
  defaultCompanyId: string | null;
  defaultOwnerId: string | null;
}) {
  const router = useRouter();
  const [newCompany, setNewCompany] = useState(companies.length === 0);
  const [company, setCompany] = useState({ id: defaultCompanyId ?? "", name: "", registration_no: "", sector: "", ceo_name: "" });
  const [values, setValues] = useState({ owner_id: defaultOwnerId ?? owners[0]?.id ?? "", target_fund_id: "", expected: "", sourced_date: today() });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);

    let companyId = company.id;
    if (newCompany) {
      const r = await post("/api/v1/companies", { name: company.name, registration_no: company.registration_no, sector: company.sector, ceo_name: company.ceo_name });
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries((r.json.error?.details?.fields ?? {}) as Errors).map(([k, v]) => [`company.${k}`, v])));
        setError(r.json.error?.message ?? "기업을 등록하지 못했습니다");
        setSaving(false);
        return;
      }
      companyId = r.json.data.id;
      // 딜 등록이 실패해도 방금 만든 기업은 목록에서 고를 수 있게 한다
      setNewCompany(false);
      setCompany((c) => ({ ...c, id: companyId }));
    }

    const r = await post("/api/v1/deals", {
      company_id: companyId,
      owner_id: values.owner_id,
      target_fund_id: values.target_fund_id || null,
      expected_amount: toAmount(values.expected),
      sourced_date: values.sourced_date,
    });
    setSaving(false);
    if (!r.ok) {
      setErrors(r.json.error?.details?.fields ?? {});
      setError(r.json.error?.message ?? "딜을 등록하지 못했습니다");
      if (newCompany) router.refresh();
      return;
    }
    router.push(`/deals/${r.json.data.id}`);
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;
  const err = (key: string) => errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">기업</h2>
          {companies.length > 0 && (
            <button type="button" onClick={() => setNewCompany(!newCompany)} className="text-sm font-semibold text-indigo-600 hover:underline">
              {newCompany ? "등록된 기업에서 고르기" : "+ 새 기업 등록"}
            </button>
          )}
        </div>
        {newCompany ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">기업명</span>
              <input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} required className={input("company.name")} />
              {err("company.name")}
            </label>
            {(
              [
                ["registration_no", "사업자등록번호", "123-45-67890"],
                ["sector", "업종·분야", "예: 핀테크"],
                ["ceo_name", "대표자", ""],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <input value={company[key]} onChange={(e) => setCompany({ ...company, [key]: e.target.value })} placeholder={placeholder} className={input(`company.${key}`)} />
                {err(`company.${key}`)}
              </label>
            ))}
          </div>
        ) : (
          <label className="mt-4 block">
            <select value={company.id} onChange={(e) => setCompany({ ...company, id: e.target.value })} required className={input("company_id")}>
              <option value="">기업을 선택하세요</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.sector ? ` · ${c.sector}` : ""}
                </option>
              ))}
            </select>
            {err("company_id")}
          </label>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">딜 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">담당자</span>
            <select value={values.owner_id} onChange={(e) => setValues({ ...values, owner_id: e.target.value })} className={input("owner_id")}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.position ? ` · ${o.position}` : ""}
                </option>
              ))}
            </select>
            {err("owner_id")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">발굴일</span>
            <input type="date" value={values.sourced_date} onChange={(e) => setValues({ ...values, sourced_date: e.target.value })} className={input("sourced_date")} />
            {err("sourced_date")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">투자 예정 조합 (선택)</span>
            <select value={values.target_fund_id} onChange={(e) => setValues({ ...values, target_fund_id: e.target.value })} className={input("target_fund_id")}>
              <option value="">아직 정하지 않음</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({FUND_STATUS_LABEL[f.status]})
                </option>
              ))}
            </select>
            {err("target_fund_id")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">예상 투자 금액 (선택)</span>
            <AmountInput value={values.expected} onChange={(v) => setValues({ ...values, expected: v })} invalid={Boolean(errors.expected_amount)} />
            {err("expected_amount")}
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">투자 확정 단계로 옮길 때는 투자 예정 조합과 예상 금액이 반드시 있어야 합니다.</p>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "등록 중…" : "딜 등록"}
        </button>
      </div>
    </form>
  );
}
