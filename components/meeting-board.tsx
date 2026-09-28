"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatPercent } from "@/lib/format";
import {
  AGENDA_RESULT_LABEL,
  AGENDA_TYPES,
  AGENDA_TYPE_LABEL,
  VOTE_CHOICES,
  VOTE_CHOICE_LABEL,
  type AgendaResult,
  type AgendaType,
  type VoteChoice,
} from "@/lib/labels";
import type { AgendaTally, MeetingDetail } from "@/lib/services/meetings";

// 총회 상세: 소집 → 투표 입력 → 개최 처리(결과 확정). 안건마다 찬성 의결권이 가결 기준을 넘는지 실시간으로 보여준다

const RESULT_COLOR: Record<AgendaResult, string> = {
  pending: "bg-slate-100 text-slate-600",
  passed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
};

const UNLOCK_LABEL: Record<string, string> = {
  "fund_transition:formed": "이제 조합을 결성할 수 있습니다",
  "fund_transition:dissolved": "이제 조합을 해산할 수 있습니다",
  terms_new_version: "이제 규약 새 버전을 만들 수 있습니다",
  manager_change: "이제 운용 인력을 교체할 수 있습니다",
};

function useApi(base: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "처리하지 못했습니다");
      return false;
    }
    router.refresh();
    return true;
  }
  return { call, busy, error };
}

export default function MeetingBoard({ fundId, meeting }: { fundId: string; meeting: MeetingDetail }) {
  const base = `/api/v1/funds/${fundId}/meetings/${meeting.id}`;
  const { call, busy, error } = useApi(base);
  const scheduled = meeting.status === "scheduled";
  const notYet = scheduled && meeting.convened_at !== null && !meeting.can_hold;

  return (
    <div className="space-y-6">
      {scheduled && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <ol className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
            <li className={meeting.convened_at ? "text-emerald-700" : "font-semibold text-slate-900"}>
              {meeting.convened_at ? "✓" : "1."} 소집 통지 {meeting.convened_at && `(${formatDate(meeting.convened_at)})`}
            </li>
            <li className={meeting.can_vote ? "font-semibold text-slate-900" : "text-slate-400"}>2. 조합원별 찬반 입력</li>
            <li className={meeting.can_hold ? "font-semibold text-slate-900" : "text-slate-400"}>3. 개최 처리 (결과 확정)</li>
          </ol>
          {meeting.can_convene && (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm("LP 조합원 전원에게 소집 통지를 보낼까요? 보낸 뒤에는 일정과 안건을 바꿀 수 없습니다.") && call("POST", "/convene")}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              소집 통지 발송
            </button>
          )}
          {meeting.can_hold && (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm("개최 처리하면 모든 안건의 가결·부결이 확정되고 투표를 더 바꿀 수 없습니다. 진행할까요?") && call("POST", "/hold")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              개최 처리
            </button>
          )}
          {notYet && <span className="text-xs text-slate-500">총회일({formatDate(meeting.meeting_date)}) 이후에 개최 처리할 수 있습니다</span>}
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm("총회를 취소할까요?") && call("POST", "/cancel")}
            className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            총회 취소
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </section>
      )}

      {meeting.agendas.map((a) => (
        <AgendaCard key={a.id} agenda={a} meeting={meeting} base={base} />
      ))}

      {meeting.can_edit && <AddAgenda base={base} meetingType={meeting.meeting_type} />}
    </div>
  );
}

function AgendaCard({ agenda: a, meeting, base }: { agenda: AgendaTally; meeting: MeetingDetail; base: string }) {
  const { call, busy, error } = useApi(base);
  const willPass = a.for_ratio >= a.quorum_ratio - 1e-9;
  const pct = (v: number) => `${Math.min(100, v * 100)}%`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          제{a.agenda_no}호 {a.title}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{AGENDA_TYPE_LABEL[a.agenda_type]}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${RESULT_COLOR[a.result]}`}>
          {a.result === "pending" && meeting.status === "scheduled" ? (willPass ? "현재 가결 요건 충족" : "현재 가결 요건 미달") : AGENDA_RESULT_LABEL[a.result]}
        </span>
      </div>
      {a.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.description}</p>}

      <div className="mt-4">
        <div className="relative flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-emerald-500" style={{ width: pct(a.for_ratio) }} />
          <div className="bg-rose-400" style={{ width: pct(a.against_ratio) }} />
          <div className="bg-slate-300" style={{ width: pct(a.abstain_ratio) }} />
        </div>
        <div className="relative h-0">
          <div className="absolute -top-4 h-5 w-0.5 bg-slate-900" style={{ left: pct(a.quorum_ratio) }} title="가결 기준" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          찬성 {formatPercent(a.for_ratio, 2)} · 반대 {formatPercent(a.against_ratio, 2)} · 기권 {formatPercent(a.abstain_ratio, 2)} · 가결 기준{" "}
          <b className="text-slate-700">전체 의결권의 {formatPercent(a.quorum_ratio, 2)} 이상 찬성</b> (미투표·기권은 찬성이 아님)
        </p>
        {a.unlocks && <p className="mt-2 text-sm font-semibold text-emerald-700">{UNLOCK_LABEL[a.unlocks] ?? a.unlocks}</p>}
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-2">조합원</th>
            <th className="py-2 text-right">의결권</th>
            <th className="py-2 text-right">의결</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {meeting.voters.map((v) => {
            const choice = a.votes[v.member_id] as VoteChoice | undefined;
            return (
              <tr key={v.member_id}>
                <td className="py-2">{v.name}</td>
                <td className="py-2 text-right tabular-nums">{formatPercent(v.voting_power, 2)}</td>
                <td className="py-2 text-right">
                  {meeting.can_vote ? (
                    <span className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                      {VOTE_CHOICES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={busy}
                          onClick={() => call("PUT", `/agendas/${a.id}/votes/${v.member_id}`, { choice: c })}
                          className={`px-2.5 py-1 text-xs font-semibold ${
                            choice === c
                              ? c === "for"
                                ? "bg-emerald-600 text-white"
                                : c === "against"
                                  ? "bg-rose-600 text-white"
                                  : "bg-slate-600 text-white"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {VOTE_CHOICE_LABEL[c]}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="text-slate-600">{choice ? VOTE_CHOICE_LABEL[choice] : "미투표"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function AddAgenda({ base, meetingType }: { base: string; meetingType: MeetingDetail["meeting_type"] }) {
  const { call, busy, error } = useApi(base);
  const [type, setType] = useState<AgendaType>("other");
  const [title, setTitle] = useState("");
  const options = AGENDA_TYPES.filter((t) => (t === "formation" ? meetingType === "formation" : t === "dissolution" ? meetingType === "dissolution" : true));

  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as AgendaType)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {options.map((t) => (
            <option key={t} value={t}>
              {AGENDA_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="추가할 안건 제목" className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={async () => (await call("POST", "/agendas", { agenda_type: type, title })) && setTitle("")}
          className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          안건 추가
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">안건은 소집 통지를 보내기 전까지만 추가할 수 있습니다.</p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </section>
  );
}
