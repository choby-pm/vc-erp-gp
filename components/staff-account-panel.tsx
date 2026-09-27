"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TempPasswordNotice from "@/components/temp-password-notice";
import { formatDate } from "@/lib/format";
import type { StaffDetail } from "@/lib/services/staff";

// 구성원 상세의 로그인 계정 · 퇴사 처리 영역

export default function StaffAccountPanel({ staff, isSelf }: { staff: StaffDetail; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ loginEmail: string; tempPassword: string } | null>(null);
  const [leftDate, setLeftDate] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));

  async function post(path: string, body?: unknown, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/staff/${staff.id}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "처리하지 못했습니다");
      return;
    }
    if (json.data?.temp_password) setTemp({ loginEmail: json.data.login_email, tempPassword: json.data.temp_password });
    router.refresh();
  }

  if (temp) {
    return <TempPasswordNotice loginEmail={temp.loginEmail} tempPassword={temp.tempPassword} onDone={() => setTemp(null)} />;
  }

  const left = Boolean(staff.left_date);
  const account = staff.account;
  const btn = "rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">로그인 계정</h2>
        {account ? (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">로그인 ID</dt>
                <dd className="font-mono text-slate-900">{account.login_email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">상태</dt>
                <dd>
                  {account.disabled_at ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">중지됨 · {formatDate(account.disabled_at)}</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">사용 중</span>
                  )}
                </dd>
              </div>
            </dl>
            {!left && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => post("/account/reset-password", undefined, "임시 비밀번호를 새로 발급할까요? 이 구성원의 기존 로그인은 모두 끊깁니다.")} className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}>
                  비밀번호 재발급
                </button>
                {account.disabled_at ? (
                  <button type="button" disabled={busy} onClick={() => post("/account/enable")} className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
                    다시 사용
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || isSelf}
                    title={isSelf ? "자기 자신의 계정은 중지할 수 없습니다" : undefined}
                    onClick={() => post("/account/disable", undefined, "이 계정을 중지할까요? 현재 로그인도 즉시 끊깁니다.")}
                    className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`}
                  >
                    계정 중지
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mt-3 text-sm text-slate-500">
            <p>로그인 계정이 없습니다. {left ? "퇴사한 구성원은 계정을 만들 수 없습니다." : "업무 이메일이 로그인 ID가 됩니다."}</p>
            {!left && (
              <button type="button" disabled={busy} onClick={() => post("/account")} className={`${btn} mt-3 border-indigo-300 text-indigo-700 hover:bg-indigo-50`}>
                로그인 계정 만들기
              </button>
            )}
          </div>
        )}
      </section>

      {!left && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">퇴사 처리</h2>
          <p className="mt-1 text-xs text-slate-500">
            로그인 계정이 자동으로 중지됩니다. 담당 중인 조합이 있으면 먼저 운용 인력을 교체해야 합니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="date" value={leftDate} onChange={(e) => setLeftDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button
              type="button"
              disabled={busy || isSelf}
              title={isSelf ? "자기 자신은 퇴사 처리할 수 없습니다" : undefined}
              onClick={() => post("/leave", { left_date: leftDate }, `${staff.name}님을 ${leftDate} 자로 퇴사 처리할까요?`)}
              className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`}
            >
              퇴사 처리
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
