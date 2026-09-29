"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate } from "@/lib/format";

// 재무·회계 탭(재무제표·장부·결산)의 조작: 수동 분개 작성, 수동 분개 역분개, 사업연도 결산

type AccountOption = { code: string; name: string; category: string };
type Line = { account: string; debit: string; credit: string };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const won = (v: number) => v.toLocaleString("ko-KR");

export function ManualJournalForm({ fundId, accounts }: { fundId: string; accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { account: "5130", debit: "", credit: "" },
    { account: "2020", debit: "", credit: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const debit = lines.reduce((s, l) => s + (toAmount(l.debit) ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (toAmount(l.credit) ?? 0), 0);
  const balanced = debit > 0 && debit === credit;

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/accounting/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        entry_date: date,
        description,
        lines: lines.filter((l) => toAmount(l.debit) || toAmount(l.credit)).map((l) => ({ account: l.account, debit: toAmount(l.debit) ?? 0, credit: toAmount(l.credit) ?? 0 })),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "기록하지 못했습니다");
      return;
    }
    setOpen(false);
    setDescription("");
    setLines([
      { account: "5130", debit: "", credit: "" },
      { account: "2020", debit: "", credit: "" },
    ]);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        + 수동 분개
      </button>
    );
  }

  const input = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
  return (
    <form onSubmit={submit} className="rounded-2xl border border-indigo-200 bg-white p-6">
      <h3 className="text-base font-semibold text-slate-900">수동 분개</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        업무 화면이 없는 거래(미지급비용 등 발생주의 조정, 예금 이자 등)를 직접 기록합니다. 차변 합과 대변 합이 같아야 하고, 결산한 기간에는 기록할 수 없습니다. 업무 기록(납입·투자·관리보수·비용)은 해당 화면에서 기록하면 자동으로 분개됩니다.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">분개일</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="block sm:col-span-3">
          <span className="text-xs font-medium text-slate-600">적요</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="예: 2026년 9월분 사무관리보수 미지급" className={`${input} mt-1`} />
        </label>
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1.5">계정과목</th>
            <th className="w-48 py-1.5 text-right">차변</th>
            <th className="w-48 py-1.5 text-right">대변</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <select value={l.account} onChange={(e) => set(i, { account: e.target.value })} className={input}>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <AmountInput value={l.debit} onChange={(v) => set(i, { debit: v, credit: v ? "" : l.credit })} aria-label="차변" />
              </td>
              <td className="py-1 pr-2">
                <AmountInput value={l.credit} onChange={(v) => set(i, { credit: v, debit: v ? "" : l.debit })} aria-label="대변" />
              </td>
              <td className="py-1 text-right">
                {lines.length > 2 && (
                  <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="줄 삭제">
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200">
          <tr>
            <td className="py-2">
              <button type="button" onClick={() => setLines([...lines, { account: "5190", debit: "", credit: "" }])} className="text-sm font-semibold text-indigo-600 hover:underline">
                + 줄 추가
              </button>
            </td>
            <td className="py-2 pr-2 text-right font-semibold tabular-nums">{won(debit)}</td>
            <td className="py-2 pr-2 text-right font-semibold tabular-nums">{won(credit)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className={`mt-2 text-sm ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
        {balanced ? "차변 합 = 대변 합 ✓" : `차대 차이 ${won(Math.abs(debit - credit))}원 — 같아야 기록할 수 있습니다`}
      </p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          취소
        </button>
        <button type="submit" disabled={busy || !balanced || !description.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "기록 중…" : "분개 기록"}
        </button>
      </div>
    </form>
  );
}

export function ReverseJournalButton({ fundId, entryId, entryNo }: { fundId: string; entryId: string; entryNo: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    const reason = window.prompt(`분개 #${entryNo}를 역분개합니다. 사유를 입력하세요.`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/v1/funds/${fundId}/accounting/journal/${entryId}/reverse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(json.error?.message ?? "역분개하지 못했습니다");
    router.refresh();
  }
  return (
    <button type="button" disabled={busy} onClick={run} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">
      역분개
    </button>
  );
}

// 결산 재개 (BR-ACC-07): 결산 분개를 역분개하고 기간 잠금을 푼다. 고친 뒤 다시 결산한다
export function ReopenClosingButton({ fundId, year }: { fundId: string; year: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    const reason = window.prompt(`${year} 사업연도 결산을 재개합니다.\n결산 분개가 역분개되고 그 기간에 다시 기록할 수 있게 됩니다. 정정을 마치면 다시 결산하세요.\n재개 사유를 입력하세요.`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/v1/funds/${fundId}/accounting/closings/${year}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(json.error?.message ?? "재개하지 못했습니다");
    router.refresh();
  }
  return (
    <button type="button" disabled={busy} onClick={run} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">
      결산 재개
    </button>
  );
}

export function ClosingPanel({ fundId, years }: { fundId: string; years: { year: number; start: string; end: string; closable: boolean; reason: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  async function close(year: number) {
    if (!window.confirm(`${year} 사업연도를 결산할까요?\n수익·비용이 이익잉여금으로 대체되고, 이 기간에는 더 이상 기록할 수 없습니다. 정정이 필요하면 결산을 재개합니다.`)) return;
    setBusy(year);
    const res = await fetch(`/api/v1/funds/${fundId}/accounting/closings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fiscal_year: year }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) window.alert(json.error?.message ?? "결산하지 못했습니다");
    router.refresh();
  }
  return (
    <ul className="divide-y divide-slate-100">
      {years.map((y) => (
        <li key={y.year} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
          <span className="font-semibold text-slate-900">{y.year} 사업연도</span>
          <span className="text-slate-500">
            {formatDate(y.start)} ~ {formatDate(y.end)}
          </span>
          <span className="ml-auto text-xs text-slate-500">{y.reason}</span>
          <button
            type="button"
            disabled={!y.closable || busy !== null}
            onClick={() => close(y.year)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy === y.year ? "결산 중…" : "결산"}
          </button>
        </li>
      ))}
    </ul>
  );
}
