"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";

// 약정 증액 (BR-MEM-06 ⚠️): 가결된 규약 변경 안건을 근거로 조합원 약정 원장에 행을 추가한다

type Member = { member_id: string; name: string; commitment_amount: number };
type Agenda = { id: string; title: string; meeting_date: string };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function CommitmentIncreaseForm({ fundId, members, agendas, unitAmount }: { fundId: string; members: Member[]; agendas: Agenda[]; unitAmount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ member_id: members[0]?.member_id ?? "", agenda_id: agendas[0]?.id ?? "", amount: "", date: today() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const member = members.find((m) => m.member_id === values.member_id);
  const amount = toAmount(values.amount) ?? 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`${member?.name}의 약정을 ${formatKRWFull(amount)} 늘릴까요? 약정 원장에 기록되어 고칠 수 없습니다.`)) return;
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/members/${values.member_id}/commitment-increases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ agenda_id: values.agenda_id, amount, entry_date: values.date }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "기록하지 못했습니다");
      return;
    }
    setOpen(false);
    setValues((v) => ({ ...v, amount: "" }));
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
        약정 증액
      </button>
    );
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  return (
    <form onSubmit={onSubmit} className="w-full rounded-xl bg-indigo-50/50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">약정 증액</h3>
      <p className="mt-0.5 text-xs text-slate-500">가결된 규약 변경 안건이 근거입니다. 1좌 금액({formatKRW(unitAmount)})의 배수, 증액 후에도 GP 의무 출자 비율을 지켜야 합니다. ⚠️ 감액·신규 가입·양도는 지원하지 않습니다.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">조합원</span>
          <select value={values.member_id} onChange={(e) => setValues({ ...values, member_id: e.target.value })} className={input("member_id")}>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>
                {m.name} · 현재 {formatKRW(m.commitment_amount)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">증액할 금액</span>
          <AmountInput value={values.amount} onChange={(v) => setValues({ ...values, amount: v })} invalid={Boolean(errors.amount)} />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">근거 안건</span>
          <select value={values.agenda_id} onChange={(e) => setValues({ ...values, agenda_id: e.target.value })} className={input("agenda_id")}>
            {agendas.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.meeting_date)} · {a.title}
              </option>
            ))}
          </select>
          {errors.agenda_id && <p className="mt-1 text-xs text-red-600">{errors.agenda_id}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">증액일</span>
          <input type="date" value={values.date} max={today()} onChange={(e) => setValues({ ...values, date: e.target.value })} className={input("entry_date")} />
          {errors.entry_date && <p className="mt-1 text-xs text-red-600">{errors.entry_date}</p>}
        </label>
      </div>
      {member && amount > 0 && <p className="mt-2 text-xs text-slate-600">증액 후 {member.name} 약정: {formatKRWFull(member.commitment_amount + amount)}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">
          취소
        </button>
        <button type="submit" disabled={saving || amount === 0} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? "기록 중…" : "증액 기록"}
        </button>
      </div>
    </form>
  );
}
