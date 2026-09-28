"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGENDA_TYPES, AGENDA_TYPE_LABEL, MEETING_TYPE_LABEL, type AgendaType, type MeetingType } from "@/lib/labels";

// 총회 생성: 유형·일시·장소 + 추가 안건. 결성·해산 안건은 서버가 자동으로 1번에 넣는다 (BR-MTG-01, 02)

type AgendaRow = { agenda_type: AgendaType; title: string };

const REQUIRED_NOTE: Partial<Record<MeetingType, string>> = {
  formation: "‘조합 결성의 건’ 안건이 자동으로 1번 안건이 됩니다.",
  dissolution: "‘조합 해산의 건’ 안건이 자동으로 1번 안건이 됩니다.",
};

export default function MeetingCreateForm({ fundId, allowedTypes }: { fundId: string; allowedTypes: MeetingType[] }) {
  const router = useRouter();
  const [type, setType] = useState<MeetingType>(allowedTypes[0]);
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [agendas, setAgendas] = useState<AgendaRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 결성·해산 안건은 해당 총회에서만 다룬다
  const agendaOptions = AGENDA_TYPES.filter((t) => (t === "formation" ? type === "formation" : t === "dissolution" ? type === "dissolution" : true));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_type: type, meeting_date: date, location, agendas: agendas.filter((a) => a.title.trim()) }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "만들지 못했습니다");
      return;
    }
    router.push(`/funds/${fundId}/meetings/${json.data.id}`);
    router.refresh();
  }

  const input = (invalid?: boolean) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${invalid ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">총회 열기</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">총회 유형</span>
          <select value={type} onChange={(e) => setType(e.target.value as MeetingType)} className={input()}>
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">총회일</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={input(Boolean(errors.meeting_date))} />
          {errors.meeting_date && <p className="mt-1 text-xs text-red-600">{errors.meeting_date}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">장소 (선택)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 본사 대회의실" className={input()} />
        </label>
      </div>
      {REQUIRED_NOTE[type] && <p className="mt-3 text-xs text-slate-500">{REQUIRED_NOTE[type]}</p>}

      <div className="mt-4 space-y-2">
        {agendas.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select
              value={a.agenda_type}
              onChange={(e) => setAgendas(agendas.map((x, j) => (j === i ? { ...x, agenda_type: e.target.value as AgendaType } : x)))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {agendaOptions.map((t) => (
                <option key={t} value={t}>
                  {AGENDA_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              value={a.title}
              onChange={(e) => setAgendas(agendas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              placeholder="안건 제목"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="button" onClick={() => setAgendas(agendas.filter((_, j) => j !== i))} className="text-sm text-slate-500 hover:text-rose-600">
              삭제
            </button>
            {errors[`agendas.${i}.agenda_type`] && <p className="w-full text-xs text-red-600">{errors[`agendas.${i}.agenda_type`]}</p>}
          </div>
        ))}
        <button type="button" onClick={() => setAgendas([...agendas, { agenda_type: "other", title: "" }])} className="text-sm font-semibold text-indigo-600 hover:underline">
          + 안건 추가
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "만드는 중…" : "총회 만들기"}
        </button>
      </div>
    </form>
  );
}
