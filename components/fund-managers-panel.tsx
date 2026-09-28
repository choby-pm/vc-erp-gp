"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { MANAGER_ROLES, MANAGER_ROLE_LABEL, type ManagerRole } from "@/lib/labels";
import type { FundManager, FundManagers } from "@/lib/services/fund-managers";

// 조합 상세의 운용 인력 영역: 현재 담당자, 선임·교체·해임, 교체 이력 (D32)

type StaffOption = { id: string; name: string; position: string };
type Errors = Record<string, string>;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const ROLE_COLOR: Record<ManagerRole, string> = {
  lead: "bg-indigo-100 text-indigo-700",
  key: "bg-sky-100 text-sky-700",
  general: "bg-slate-100 text-slate-600",
};

type Agenda = { id: string; title: string; meeting_date: string };

export default function FundManagersPanel({
  fundId,
  managers,
  staffOptions,
  agendas = [],
}: {
  fundId: string;
  managers: FundManagers;
  staffOptions: StaffOption[];
  agendas?: Agenda[]; // 결성 이후: 가결된 운용 인력 교체 안건 (BR-MGR-04)
}) {
  const router = useRouter();
  const needAgenda = managers.changes_need_agenda;
  const [agendaId, setAgendaId] = useState(agendas[0]?.id ?? "");
  // 결성 이후에는 근거 안건을 골라야 선임·교체·해임할 수 있다
  const locked = needAgenda && !agendaId;
  const [replacing, setReplacing] = useState<FundManager | null>(null);
  const [ending, setEnding] = useState<{ id: string; date: string } | null>(null);
  const [form, setForm] = useState({ staff_id: "", role: (managers.has_lead ? "key" : "lead") as ManagerRole, start_date: today() });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 이미 담당 중인 구성원은 고를 수 없다. 단, 교체 중이면 역할만 바꾸는 경우를 위해 교체 대상은 남긴다
  const assigned = new Set(managers.current.filter((m) => m.id !== replacing?.id).map((m) => m.staff_id));
  const options = staffOptions.filter((s) => !assigned.has(s.id));

  async function post(path: string, body: unknown) {
    setBusy(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/managers${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(needAgenda ? { ...(body as object), agenda_id: agendaId } : body),
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

  async function onAppoint(e: React.FormEvent) {
    e.preventDefault();
    const done = await post("", { ...form, replaces_id: replacing?.id ?? null });
    if (done) {
      setReplacing(null);
      setForm({ staff_id: "", role: "key", start_date: today() });
    }
  }

  async function onEnd(m: FundManager) {
    if (!ending) return;
    if (m.role === "lead" && !window.confirm("대표펀드매니저를 해임하면 새로 지정할 때까지 결성할 수 없습니다. 해임할까요?")) return;
    if (await post(`/${m.id}/end`, { end_date: ending.date })) setEnding(null);
  }

  function startReplace(m: FundManager) {
    setReplacing(m);
    setEnding(null);
    setErrors({});
    setError(null);
    setForm({ staff_id: "", role: m.role, start_date: today() });
  }

  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
    }`;
  const btn = "rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">운용 인력</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {!needAgenda
          ? "결성 전까지 자유롭게 지정·교체할 수 있습니다. 교체해도 이전 담당 이력은 남습니다."
          : agendas.length === 0
            ? "결성 이후 선임·해임은 총회에서 ‘운용 인력 교체’ 안건이 가결되어야 합니다. 총회 탭에서 안건을 올려 가결하세요."
            : "결성 이후 선임·해임은 가결된 ‘운용 인력 교체’ 안건을 근거로 기록합니다. 교체해도 이전 담당 이력은 남습니다."}
      </p>

      {needAgenda && agendas.length > 0 && (
        <label className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50/60 px-4 py-3 text-sm">
          <span className="font-medium text-slate-700">근거 안건</span>
          <select value={agendaId} onChange={(e) => setAgendaId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
            {agendas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.meeting_date} · {a.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {!managers.has_lead && !locked && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          결성하려면 <b>대표펀드매니저</b>를 지정해야 합니다.
        </p>
      )}

      {managers.current.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          아직 지정된 운용 인력이 없습니다.
        </p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-2">역할</th>
              <th className="py-2">이름</th>
              <th className="py-2">선임일</th>
              {!locked && <th className="py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {managers.current.map((m) => (
              <tr key={m.id} className={replacing?.id === m.id ? "bg-indigo-50/50" : ""}>
                <td className="py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[m.role]}`}>{MANAGER_ROLE_LABEL[m.role]}</span>
                </td>
                <td className="py-2.5">
                  <Link href={`/staff/${m.staff_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                    {m.name}
                  </Link>{" "}
                  <span className="text-slate-500">{m.position}</span>
                </td>
                <td className="py-2.5 text-slate-700">{formatDate(m.start_date)}</td>
                {!locked && (
                  <td className="py-2.5 text-right">
                    {ending?.id === m.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <input type="date" value={ending.date} onChange={(e) => setEnding({ id: m.id, date: e.target.value })} aria-label="해임일" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                        <button type="button" disabled={busy} onClick={() => onEnd(m)} className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`}>
                          해임
                        </button>
                        <button type="button" onClick={() => setEnding(null)} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}>
                          취소
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => startReplace(m)} className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}>
                          교체
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplacing(null);
                            setEnding({ id: m.id, date: today() });
                          }}
                          className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}
                        >
                          해임
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!locked && (
        <form onSubmit={onAppoint} className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {replacing ? `${replacing.name} (${MANAGER_ROLE_LABEL[replacing.role]}) 교체` : "운용 인력 지정"}
            </h3>
            {replacing && (
              <button type="button" onClick={() => setReplacing(null)} className="text-xs text-slate-500 hover:text-slate-700">
                교체 취소
              </button>
            )}
          </div>
          {replacing && <p className="mt-1 text-xs text-slate-500">기존 담당자는 교체일 자로 해임되고, 같은 사람을 고르면 역할만 바뀝니다.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">구성원</span>
              <select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} required className={inputClass("staff_id")}>
                <option value="">선택하세요</option>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.position}
                  </option>
                ))}
              </select>
              {errors.staff_id && <p className="mt-1 text-xs text-red-600">{errors.staff_id}</p>}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">역할</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ManagerRole })} className={inputClass("role")}>
                {MANAGER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {MANAGER_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role}</p>}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{replacing ? "교체일" : "선임일"}</span>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required className={inputClass("start_date")} />
              {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date}</p>}
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "처리 중…" : replacing ? "교체" : "지정"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {managers.history.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900">교체 이력 {managers.history.length}건</summary>
          <table className="mt-2 w-full text-slate-500">
            <tbody className="divide-y divide-slate-100">
              {managers.history.map((m) => (
                <tr key={m.id}>
                  <td className="py-2">{MANAGER_ROLE_LABEL[m.role]}</td>
                  <td className="py-2">
                    <Link href={`/staff/${m.staff_id}`} className="hover:text-indigo-600">
                      {m.name}
                    </Link>{" "}
                    · {m.position}
                  </td>
                  <td className="py-2 text-right">
                    {formatDate(m.start_date)} ~ {formatDate(m.end_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
