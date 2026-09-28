"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { INSTITUTION_TYPES, INSTITUTION_TYPE_LABEL, type InstitutionType } from "@/lib/labels";
import type { Institution } from "@/lib/services/institutions";

// 등록 정보(결성 후 ~ 운용 시작 전 입력)와 관계 기관(종류별 1곳) 관리

type Errors = Record<string, string>;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const } : { ok: false as const, message: (json.error?.message as string) ?? "처리하지 못했습니다", fields: (json.error?.details?.fields ?? {}) as Errors };
}

const input = (invalid?: boolean) =>
  `mt-1 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 ${invalid ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

export function RegistrationPanel({
  fundId,
  editable,
  applied,
  completed,
}: {
  fundId: string;
  editable: boolean; // 결성 완료 상태에서만
  applied: string | null;
  completed: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ registration_applied_date: applied ?? "", registration_completed_date: completed ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await send(`/api/v1/funds/${fundId}/registration`, "PUT", {
      registration_applied_date: values.registration_applied_date,
      registration_completed_date: values.registration_completed_date || null,
    });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fields);
      setError(r.message);
      return;
    }
    setErrors({});
    setError(null);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">조합 등록</h2>
      <p className="mt-0.5 text-xs text-slate-500">결성 후 관계 기관에 조합을 등록합니다. 등록 완료일이 있어야 운용을 시작할 수 있습니다. ⚠️ 등록 기관·절차는 조합 유형마다 다릅니다.</p>
      {editable ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["registration_applied_date", "registration_completed_date"] as const).map((key) => (
              <label key={key} className="block">
                <span className="text-xs font-medium text-slate-600">{key === "registration_applied_date" ? "등록 신청일" : "등록 완료일 (완료되면 입력)"}</span>
                <input type="date" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className={input(Boolean(errors[key]))} />
                {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
              </label>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={busy || !values.registration_applied_date} onClick={save} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </>
      ) : (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">등록 신청일</dt>
            <dd className="font-medium">{applied ? formatDate(applied) : "-"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">등록 완료일</dt>
            <dd className="font-medium">{completed ? formatDate(completed) : "-"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

const EMPTY = { institution_type: "custodian" as InstitutionType, name: "", contact_name: "", contact_email: "", contact_phone: "" };

export function InstitutionsPanel({ fundId, institutions, editable }: { fundId: string; institutions: Institution[]; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/funds/${fundId}/institutions`;
  const freeTypes = INSTITUTION_TYPES.filter((t) => !institutions.some((i) => i.institution_type === t));

  function open(target: Institution | "new") {
    setErrors({});
    setError(null);
    if (target === "new") {
      setValues({ ...EMPTY, institution_type: freeTypes[0] ?? "custodian" });
      setEditing("new");
    } else {
      setValues({
        institution_type: target.institution_type,
        name: target.name,
        contact_name: target.contact_name ?? "",
        contact_email: target.contact_email ?? "",
        contact_phone: target.contact_phone ?? "",
      });
      setEditing(target.id);
    }
  }

  async function run(url: string, method: string, body?: unknown) {
    setBusy(true);
    const r = await send(url, method, body);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fields);
      setError(r.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  const form = (
    <div className="mt-3 rounded-xl bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">종류</span>
          <select value={values.institution_type} onChange={(e) => setValues({ ...values, institution_type: e.target.value as InstitutionType })} className={input(Boolean(errors.institution_type))}>
            {INSTITUTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {INSTITUTION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {errors.institution_type && <p className="mt-1 text-xs text-red-600">{errors.institution_type}</p>}
        </label>
        {(
          [
            ["name", "기관명"],
            ["contact_name", "담당자"],
            ["contact_email", "이메일"],
            ["contact_phone", "전화번호"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-slate-600">{label}</span>
            <input value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className={input(Boolean(errors[key]))} />
            {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => (editing === "new" ? run(base, "POST", values) : run(`${base}/${editing}`, "PATCH", values))}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">관계 기관</h2>
        {editable && freeTypes.length > 0 && editing === null && (
          <button type="button" onClick={() => open("new")} className="text-sm font-semibold text-indigo-600 hover:underline">
            + 기관 추가
          </button>
        )}
      </div>
      {institutions.length === 0 && editing !== "new" ? (
        <p className="mt-3 text-sm text-slate-500">수탁은행·사무관리사·회계감사인을 등록하세요.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {institutions.map((i) =>
            editing === i.id ? (
              <li key={i.id}>{form}</li>
            ) : (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-24 text-slate-500">{INSTITUTION_TYPE_LABEL[i.institution_type]}</span>
                <span className="font-medium text-slate-900">{i.name}</span>
                <span className="text-xs text-slate-500">{[i.contact_name, i.contact_email, i.contact_phone].filter(Boolean).join(" · ")}</span>
                {editable && editing === null && (
                  <span className="ml-auto flex gap-3 text-xs">
                    <button type="button" onClick={() => open(i)} className="text-slate-600 hover:text-indigo-600">
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`${i.name}을(를) 삭제할까요?`) && run(`${base}/${i.id}`, "DELETE")}
                      className="text-slate-600 hover:text-rose-600"
                    >
                      삭제
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {editing === "new" && form}
      {error && editing === null && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
