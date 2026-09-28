"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW, formatPercent } from "@/lib/format";
import type { FundRoster } from "@/lib/services/roster";

// 조합원 명부 확정 폼: 확약된 제안 중 조합원이 될 LP와 최종 약정액, GP 약정액을 입력한다 (BR-MEM-01~03, 07)

type Row = { proposal_id: string; lp_name: string; loc_amount: number; included: boolean; amount: string };
type Errors = Record<string, string>;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function RosterForm({ fundId, data }: { fundId: string; data: FundRoster }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    // 최종 약정액의 기본값은 확약 금액 (BR-MEM-01)
    data.candidates.map((c) => ({ proposal_id: c.proposal_id, lp_name: c.lp_name, loc_amount: c.loc_amount, included: true, amount: String(c.loc_amount) })),
  );
  const [gpAmount, setGpAmount] = useState("");
  const [date, setDate] = useState(today());
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const included = rows.filter((r) => r.included);
  const lpTotal = included.reduce((s, r) => s + (toAmount(r.amount) ?? 0), 0);
  const gp = toAmount(gpAmount) ?? 0;
  const total = lpTotal + gp;
  const gpRatio = total > 0 ? gp / total : 0;
  const unit = data.unit_amount;
  // GP 비율을 맞추는 최소 GP 약정액: gp ≥ r × (lp + gp) → gp ≥ r × lp ÷ (1 - r), 1좌 단위로 올림
  const r = data.gp_commitment_min_ratio;
  const minGp = r < 1 ? Math.ceil((r * lpTotal) / (1 - r) / unit) * unit : null;

  const checks = [
    { ok: included.length > 0, label: "LP 조합원 1명 이상" },
    { ok: gp > 0, label: "GP 약정액 입력 (BR-MEM-02)" },
    { ok: total > 0 && gpRatio >= r, label: `GP 출자 비율 ${formatPercent(gpRatio, 2)} ≥ 최소 ${formatPercent(r)} (BR-MEM-03)` },
    { ok: [gp, ...included.map((x) => toAmount(x.amount) ?? 0)].every((a) => a > 0 && a % unit === 0), label: `약정액이 1좌 금액(${formatKRW(unit)})의 배수 (BR-MEM-07)` },
  ];

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      confirmed_date: date,
      gp_commitment_amount: toAmount(gpAmount),
      members: included.map((x) => ({ proposal_id: x.proposal_id, commitment_amount: toAmount(x.amount) })),
    };
    if (!window.confirm(`약정 총액 ${formatKRW(total)}으로 조합원 명부를 확정할까요?\n조합원별 약정이 원장에 기록되고 LP에게 알림이 갑니다.`)) return;
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/roster`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      // 서버는 members.{포함된 순번} 으로 알려준다. 화면 행 번호로 바꾼다
      const fields: Errors = {};
      for (const [k, v] of Object.entries((json.error?.details?.fields ?? {}) as Errors)) {
        const m = k.match(/^members\.(\d+)\.(\w+)$/);
        fields[m ? `${included[Number(m[1])].proposal_id}.${m[2]}` : k] = v;
      }
      setErrors(fields);
      setError(json.error?.message ?? "확정하지 못했습니다");
      return;
    }
    router.refresh();
  }

  if (data.candidates.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        확약된 출자 제안이 없습니다. 출자자 모집 화면에서 확약을 먼저 기록하세요.
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">조합원 명부 확정</h2>
      <p className="mt-0.5 text-xs text-slate-500">확약(약속)을 약정(법적 금액)으로 바꿉니다. 최종 약정액의 기본값은 확약 금액입니다.</p>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="w-8 py-2" />
            <th className="py-2">조합원</th>
            <th className="py-2 text-right">확약 금액</th>
            <th className="w-56 py-2 text-right">최종 약정액 (원)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-2" />
            <td className="py-2 font-semibold text-slate-900">
              GP <span className="text-xs font-normal text-slate-500">운용사 출자 (필수)</span>
            </td>
            <td className="py-2 text-right text-xs text-slate-500">{minGp !== null && lpTotal > 0 ? `최소 약 ${formatKRW(minGp)}` : ""}</td>
            <td className="py-2">
              <AmountInput value={gpAmount} onChange={setGpAmount} invalid={Boolean(errors.gp_commitment_amount)} aria-label="GP 약정액" />
              {errors.gp_commitment_amount && <p className="mt-1 text-right text-xs text-red-600">{errors.gp_commitment_amount}</p>}
            </td>
          </tr>
          {rows.map((row, i) => (
            <tr key={row.proposal_id} className={row.included ? "" : "text-slate-400"}>
              <td className="py-2">
                <input type="checkbox" checked={row.included} onChange={(e) => update(i, { included: e.target.checked })} aria-label={`${row.lp_name} 포함`} />
              </td>
              <td className="py-2 font-medium">{row.lp_name}</td>
              <td className="py-2 text-right tabular-nums">{formatKRW(row.loc_amount)}</td>
              <td className="py-2">
                {row.included && (
                  <>
                    <AmountInput value={row.amount} onChange={(v) => update(i, { amount: v })} invalid={Boolean(errors[`${row.proposal_id}.commitment_amount`])} aria-label={`${row.lp_name} 약정액`} />
                    {errors[`${row.proposal_id}.commitment_amount`] && <p className="mt-1 text-right text-xs text-red-600">{errors[`${row.proposal_id}.commitment_amount`]}</p>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 text-sm">
          <tr>
            <td />
            <td className="py-3 font-semibold text-slate-900">약정 총액</td>
            <td />
            <td className="py-3 text-right font-bold tabular-nums text-slate-900">{formatKRW(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-emerald-700" : "text-slate-500"}>
              {c.ok ? "✓" : "○"} {c.label}
            </li>
          ))}
          {data.min_fund_amount !== null && (
            <li className={total >= data.min_fund_amount ? "text-emerald-700" : "text-amber-700"}>
              {total >= data.min_fund_amount ? "✓" : "!"} 최소 결성액 {formatKRW(data.min_fund_amount)}
              {total < data.min_fund_amount && " 미달 — 명부는 확정할 수 있지만 이대로는 결성할 수 없습니다"}
            </li>
          )}
        </ul>
        <label className="block sm:justify-self-end">
          <span className="text-xs font-medium text-slate-600">명부 확정일 (약정일)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "확정 중…" : "명부 확정"}
        </button>
      </div>
    </form>
  );
}
