"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyDetail } from "@/lib/services/companies";

// 기업 등록·수정 공용 폼

type Errors = Record<string, string>;

export default function CompanyForm({ company }: { company?: CompanyDetail }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: company?.name ?? "",
    registration_no: company?.registration_no ?? "",
    sector: company?.sector ?? "",
    ceo_name: company?.ceo_name ?? "",
    founded_date: company?.founded_date ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; existingId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    const res = await fetch(company ? `/api/v1/companies/${company.id}` : "/api/v1/companies", {
      method: company ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, founded_date: values.founded_date || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push(`/companies/${body.data.id}`);
      router.refresh();
      return;
    }
    setErrors(body.error?.details?.fields ?? {});
    setFormError({ message: body.error?.message ?? "저장하지 못했습니다", existingId: body.error?.details?.existing_company_id });
    setSaving(false);
  }

  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
    }`;
  const field = (key: keyof typeof values, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input value={values[key]} onChange={(e) => set(key, e.target.value)} className={inputClass(key)} {...props} />
      {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "기업명", { placeholder: "예: 주식회사 넥스트랩" })}</div>
          {field("registration_no", "사업자등록번호", { placeholder: "123-45-67890", inputMode: "numeric" })}
          {field("sector", "업종·분야", { placeholder: "예: AI 반도체" })}
          {field("ceo_name", "대표자")}
          {field("founded_date", "설립일", { type: "date" })}
        </div>
      </section>
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError.message}
          {formError.existingId && (
            <Link href={`/companies/${formError.existingId}`} className="ml-2 font-semibold underline">
              기존 기업 보기
            </Link>
          )}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "저장 중…" : company ? "저장" : "등록"}
        </button>
      </div>
    </form>
  );
}
