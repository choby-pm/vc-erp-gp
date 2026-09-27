"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TempPasswordNotice from "@/components/temp-password-notice";
import type { StaffDetail } from "@/lib/services/staff";

// 구성원 등록·수정 공용 폼

type Errors = Record<string, string>;
type Created = { id: string; loginEmail: string; tempPassword: string };

export default function StaffForm({ staff }: { staff?: StaffDetail }) {
  const router = useRouter();
  const [values, setValues] = useState({
    employee_no: staff?.employee_no ?? "",
    name: staff?.name ?? "",
    position: staff?.position ?? "",
    department: staff?.department ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    hired_date: staff?.hired_date ?? "",
  });
  const [createAccount, setCreateAccount] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

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

    const res = await fetch(staff ? `/api/v1/staff/${staff.id}` : "/api/v1/staff", {
      method: staff ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(staff ? values : { ...values, create_account: createAccount }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrors(body.error?.details?.fields ?? {});
      setFormError(body.error?.message ?? "저장하지 못했습니다");
      setSaving(false);
      return;
    }
    const id = staff ? staff.id : body.data.staff.id;
    // 계정을 함께 만들었으면 임시 비밀번호를 먼저 보여주고, 확인한 뒤 상세로 이동한다
    if (!staff && body.data.account) {
      setCreated({ id, loginEmail: body.data.account.login_email, tempPassword: body.data.account.temp_password });
      return;
    }
    router.push(`/staff/${id}`);
    router.refresh();
  }

  if (created) {
    return (
      <TempPasswordNotice
        loginEmail={created.loginEmail}
        tempPassword={created.tempPassword}
        onDone={() => {
          router.push(`/staff/${created.id}`);
          router.refresh();
        }}
      />
    );
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
        <h2 className="text-base font-semibold text-slate-900">인사 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("employee_no", "사번", { placeholder: "예: GP-2024-003" })}
          {field("name", "이름")}
          {field("position", "직위", { placeholder: "예: 수석심사역" })}
          {field("department", "부서", { placeholder: "예: 투자본부" })}
          {field("hired_date", "입사일", { type: "date" })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">연락처</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("email", "업무 이메일", { type: "email", placeholder: "name@company.com" })}
          {field("phone", "전화번호", { placeholder: "010-1234-5678" })}
        </div>
        {!staff && (
          <label className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium text-slate-800">로그인 계정도 함께 만들기</span>
              <span className="block text-xs text-slate-500">업무 이메일이 로그인 ID가 되고, 임시 비밀번호가 한 번만 표시됩니다.</span>
            </span>
          </label>
        )}
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
          {saving ? "저장 중…" : staff ? "저장" : "등록"}
        </button>
      </div>
    </form>
  );
}
