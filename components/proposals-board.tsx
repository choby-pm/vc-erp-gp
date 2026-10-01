"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { LP_TYPE_LABEL, PROPOSAL_STATUS_LABEL, type LpType, type ProposalStatus } from "@/lib/labels";
import type { FundProposals, ProposalItem } from "@/lib/services/proposals";

// 출자 제안 목록 + 작성·발송·단계 이동·수정 (단계 2. LP 모집)

type LpOption = { id: string; name: string; lp_type: LpType };
type Errors = Record<string, string>;
type Mode = "commit" | "decline" | "edit";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const STATUS_COLOR: Record<ProposalStatus, string> = {
  proposed: "bg-slate-100 text-slate-700",
  reviewing: "bg-amber-100 text-amber-800",
  committed: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-700",
};

const labelClass = "text-xs font-medium text-slate-600";
const inputClass = (invalid?: boolean) =>
  `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
    invalid ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
  }`;
const btn = "rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50";

function useApi(fundId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/proposals${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "처리하지 못했습니다");
      return false;
    }
    router.refresh();
    return true;
  }
  function clear() {
    setErrors({});
    setError(null);
  }
  return { call, busy, errors, error, clear };
}

export default function ProposalsBoard({ fundId, data, lps }: { fundId: string; data: FundProposals; lps: LpOption[] }) {
  const proposed = new Set(data.items.map((p) => p.lp_id));
  const available = lps.filter((lp) => !proposed.has(lp.id));

  return (
    <div className="space-y-6">
      {data.can_edit && <NewProposalForm fundId={fundId} lps={available} hasAnyLp={lps.length > 0} />}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">출자 제안 {data.items.length}건</h2>
          <p className="text-xs text-slate-500">
            {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => `${PROPOSAL_STATUS_LABEL[s]} ${data.summary.counts[s]}`).join(" · ")}
          </p>
        </div>
        {data.items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">아직 출자 제안이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((p) => (
              <ProposalRow key={p.id} fundId={fundId} p={p} canEdit={data.can_edit} canSend={data.can_send} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewProposalForm({ fundId, lps, hasAnyLp }: { fundId: string; lps: LpOption[]; hasAnyLp: boolean }) {
  const { call, busy, errors, error } = useApi(fundId);
  const [form, setForm] = useState({ lp_id: "", amount: "", proposed_date: today(), memo: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const done = await call("POST", "", {
      lp_id: form.lp_id,
      proposed_amount: toAmount(form.amount),
      proposed_date: form.proposed_date,
      memo: form.memo,
    });
    if (done) setForm({ lp_id: "", amount: "", proposed_date: today(), memo: "" });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">출자 제안 작성</h2>
      {!hasAnyLp ? (
        <p className="mt-2 text-sm text-slate-500">
          등록된 출자자가 없습니다.{" "}
          <Link href="/lps/new" className="font-semibold text-indigo-600 hover:underline">
            출자자 등록
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={labelClass}>출자자</span>
              <select value={form.lp_id} onChange={(e) => setForm({ ...form, lp_id: e.target.value })} required className={inputClass(Boolean(errors.lp_id))}>
                <option value="">{lps.length === 0 ? "모든 출자자에게 제안했습니다" : "선택하세요"}</option>
                {lps.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name} · {LP_TYPE_LABEL[lp.lp_type]}
                  </option>
                ))}
              </select>
              {errors.lp_id && <p className="mt-1 text-xs text-red-600">{errors.lp_id}</p>}
            </label>
            <label className="block">
              <span className={labelClass}>제안 금액 (원, 선택)</span>
              <AmountInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} invalid={Boolean(errors.proposed_amount)} placeholder="3,000,000,000" />
              {errors.proposed_amount && <p className="mt-1 text-xs text-red-600">{errors.proposed_amount}</p>}
            </label>
            <label className="block">
              <span className={labelClass}>제안일</span>
              <input type="date" value={form.proposed_date} onChange={(e) => setForm({ ...form, proposed_date: e.target.value })} required className={inputClass(Boolean(errors.proposed_date))} />
              {errors.proposed_date && <p className="mt-1 text-xs text-red-600">{errors.proposed_date}</p>}
            </label>
            <label className="block sm:col-span-3">
              <span className={labelClass}>내부 메모 (LP 비공개, 선택)</span>
              <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="예: 10월 투심위 상정 예정" className={inputClass(Boolean(errors.memo))} />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={busy || lps.length === 0} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "저장 중…" : "제안 작성"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ProposalRow({ fundId, p, canEdit, canSend }: { fundId: string; p: ProposalItem; canEdit: boolean; canSend: boolean }) {
  const { call, busy, errors, error, clear } = useApi(fundId);
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState({ proposed: "", loc: "", date: today(), memo: "" });

  const open = p.status === "proposed" || p.status === "reviewing";

  function start(next: Mode) {
    clear();
    setMode(next);
    setForm({
      proposed: p.proposed_amount ? String(p.proposed_amount) : "",
      // 확약할 때는 제안 금액을 기본값으로 채운다
      loc: p.loc_amount ? String(p.loc_amount) : next === "commit" && p.proposed_amount ? String(p.proposed_amount) : "",
      date: today(),
      memo: p.memo ?? "",
    });
  }

  async function submit() {
    const path = `/${p.id}`;
    const done =
      mode === "edit"
        ? await call("PATCH", path, {
            proposed_amount: toAmount(form.proposed),
            loc_amount: p.status === "committed" ? toAmount(form.loc) : null,
            memo: form.memo,
          })
        : await call("POST", `${path}/transitions`, {
            to_status: mode === "commit" ? "committed" : "declined",
            loc_amount: mode === "commit" ? toAmount(form.loc) : null,
            decided_date: form.date,
          });
    if (done) setMode(null);
  }

  async function send() {
    const again = p.send_count > 0 ? ` (이미 ${p.send_count}회 발송함)` : "";
    if (!window.confirm(`${p.lp_name}에게 출자 제안 통지를 발송할까요?${again}\n발송한 통지는 수정할 수 없습니다.`)) return;
    await call("POST", `/${p.id}/send`);
  }

  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/lps/${p.lp_id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
              {p.lp_name}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status]}`}>{PROPOSAL_STATUS_LABEL[p.status]}</span>
            {p.decided_via === "lp_system" && (
              <span title="LP 시스템이 연동 API로 응답했습니다 (D45)" className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                LP 직접
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {LP_TYPE_LABEL[p.lp_type]} · 제안 {formatDate(p.proposed_date)}
            {p.decided_date && ` · ${p.status === "committed" ? "확약" : "거절"} ${formatDate(p.decided_date)}`}
            {" · "}
            {p.send_count > 0 ? `발송 ${p.send_count}회 (최근 ${formatDate(p.last_sent_at)})` : "미발송"}
          </p>
          {p.memo && <p className="mt-1 text-xs text-amber-800">메모: {p.memo}</p>}
        </div>
        <dl className="flex gap-6 text-right text-sm">
          <div>
            <dt className="text-xs text-slate-500">제안 금액</dt>
            <dd className="tabular-nums" title={formatKRWFull(p.proposed_amount)}>{p.proposed_amount ? formatKRW(p.proposed_amount) : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">확약 금액</dt>
            <dd className="font-semibold tabular-nums text-slate-900" title={formatKRWFull(p.loc_amount)}>{p.loc_amount ? formatKRW(p.loc_amount) : "-"}</dd>
          </div>
        </dl>
        {canEdit && mode === null && (
          <div className="flex flex-wrap gap-1.5 self-center">
            {open && canSend && (
              <button type="button" disabled={busy} onClick={send} className={`${btn} border-indigo-300 text-indigo-700 hover:bg-indigo-50`}>
                {p.send_count > 0 ? "재발송" : "발송"}
              </button>
            )}
            {p.status === "proposed" && (
              <button type="button" disabled={busy} onClick={() => call("POST", `/${p.id}/transitions`, { to_status: "reviewing" })} className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}>
                검토 중
              </button>
            )}
            {open && (
              <>
                <button type="button" onClick={() => start("commit")} className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
                  확약
                </button>
                <button type="button" onClick={() => start("decline")} className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`}>
                  거절
                </button>
              </>
            )}
            {p.status !== "declined" && (
              <button type="button" onClick={() => start("edit")} className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}>
                수정
              </button>
            )}
          </div>
        )}
      </div>

      {mode && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {mode === "commit" ? "확약 기록" : mode === "decline" ? "거절 기록" : "제안 수정"}
            {mode !== "edit" && <span className="ml-2 text-xs font-normal text-slate-500">확약·거절은 되돌릴 수 없습니다</span>}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {mode === "edit" && (
              <label className="block">
                <span className={labelClass}>제안 금액 (원)</span>
                <AmountInput value={form.proposed} onChange={(v) => setForm({ ...form, proposed: v })} invalid={Boolean(errors.proposed_amount)} />
                {errors.proposed_amount && <p className="mt-1 text-xs text-red-600">{errors.proposed_amount}</p>}
              </label>
            )}
            {(mode === "commit" || (mode === "edit" && p.status === "committed")) && (
              <label className="block">
                <span className={labelClass}>확약 금액 (원)</span>
                <AmountInput value={form.loc} onChange={(v) => setForm({ ...form, loc: v })} invalid={Boolean(errors.loc_amount)} required />
                {errors.loc_amount && <p className="mt-1 text-xs text-red-600">{errors.loc_amount}</p>}
              </label>
            )}
            {mode !== "edit" && (
              <label className="block">
                <span className={labelClass}>{mode === "commit" ? "확약일" : "거절일"}</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass(Boolean(errors.decided_date))} />
                {errors.decided_date && <p className="mt-1 text-xs text-red-600">{errors.decided_date}</p>}
              </label>
            )}
            {mode === "edit" && (
              <label className="block sm:col-span-3">
                <span className={labelClass}>내부 메모 (LP 비공개)</span>
                <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className={inputClass(Boolean(errors.memo))} />
              </label>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              취소
            </button>
            <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "저장 중…" : mode === "commit" ? "확약" : mode === "decline" ? "거절" : "저장"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
