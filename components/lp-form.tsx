"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LP_TYPES, LP_TYPE_LABEL, type LpType } from "@/lib/labels";
import type { LpDetail } from "@/lib/services/lps";

// 출자자 등록·수정 공용 폼

type Errors = Record<string, string>;

export default function LpForm({ lp }: { lp?: LpDetail }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: lp?.name ?? "",
    lp_type: (lp?.lp_type ?? "pension") as LpType,
    registration_no: lp?.registration_no ?? "",
    contact_name: lp?.contact_name ?? "",
    contact_email: lp?.contact_email ?? "",
    contact_phone: lp?.contact_phone ?? "",
    memo: lp?.memo ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; existingId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const isIndividual = values.lp_type === "individual";

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({
      ...prev,
      [key]: value,
      // 개인으로 바꾸면 사업자등록번호를 비운다 (개인 식별번호는 저장하지 않음)
      ...(key === "lp_type" && value === "individual" ? { registration_no: "" } : {}),
    }));
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

    const res = await fetch(lp ? `/api/v1/lps/${lp.id}` : "/api/v1/lps", {
      method: lp ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      router.push(`/lps/${body.data.id}`);
      router.refresh();
      return;
    }
    setErrors(body.error?.details?.fields ?? {});
    setFormError({ message: body.error?.message ?? "저장하지 못했습니다", existingId: body.error?.details?.existing_lp_id });
    setSaving(false);
  }

  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
    }`;
  const fieldError = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">출자자명</span>
            <input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 한국성장연기금" className={inputClass("name")} />
            {fieldError("name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">유형</span>
            <select value={values.lp_type} onChange={(e) => set("lp_type", e.target.value as LpType)} className={inputClass("lp_type")}>
              {LP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {fieldError("lp_type")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">사업자등록번호</span>
            <input
              value={values.registration_no}
              onChange={(e) => set("registration_no", e.target.value)}
              disabled={isIndividual}
              placeholder={isIndividual ? "개인은 입력하지 않습니다" : "123-45-67890"}
              inputMode="numeric"
              className={`${inputClass("registration_no")} tabular-nums`}
            />
            <p className="mt-1 text-xs text-slate-500">
              {isIndividual ? "개인정보 보호를 위해 주민등록번호 등은 저장하지 않습니다" : "같은 번호의 출자자는 중복 등록할 수 없습니다"}
            </p>
            {fieldError("registration_no")}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">담당자</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">이름</span>
            <input value={values.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={inputClass("contact_name")} />
            {fieldError("contact_name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">이메일</span>
            <input type="email" value={values.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={inputClass("contact_email")} />
            {fieldError("contact_email")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">전화번호</span>
            <input value={values.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="02-1234-5678" className={inputClass("contact_phone")} />
            {fieldError("contact_phone")}
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">내부 메모</span>
          <textarea value={values.memo} onChange={(e) => set("memo", e.target.value)} rows={3} className={inputClass("memo")} />
          <p className="mt-1 text-xs text-slate-500">GP 내부용입니다. LP 시스템에는 공개되지 않습니다.</p>
          {fieldError("memo")}
        </label>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError.message}
          {formError.existingId && (
            <Link href={`/lps/${formError.existingId}`} className="ml-2 font-semibold underline">
              기존 출자자 보기
            </Link>
          )}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "저장 중…" : lp ? "저장" : "등록"}
        </button>
      </div>
    </form>
  );
}
