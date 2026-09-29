"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import type { Attachment, AttachmentTarget } from "@/lib/services/attachments";

// 규약 원문·보고서 PDF 첨부 (D41, BR-FILE-01). 파일은 비공개 저장소에 두고, 여는 것은 로그인한 GP만

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

export default function AttachmentPanel({
  fundId,
  targetType,
  targetId,
  attachments,
  storageConfigured,
  note,
}: {
  fundId: string;
  targetType: AttachmentTarget;
  targetId: string;
  attachments: Attachment[];
  storageConfigured: boolean;
  note?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/funds/${fundId}/attachments`;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("target_type", targetType);
    form.append("target_id", targetId);
    const res = await fetch(base, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) {
      setError(json.error?.message ?? "올리지 못했습니다");
      return;
    }
    router.refresh();
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`${a.file_name}을(를) 지울까요?\n목록과 LP 시스템에서 빠집니다. 기록은 남습니다.`)) return;
    setBusy(true);
    const res = await fetch(`${base}/${a.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(json.error?.message ?? "지우지 못했습니다");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <a href={`${base}/${a.id}/download`} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
                📄 {a.file_name}
              </a>
              <span className="text-xs text-slate-500">
                {size(a.size_bytes)} · {formatDate(a.created_at)}
                {a.uploaded_by_name && ` · ${a.uploaded_by_name}`}
              </span>
              <button type="button" disabled={busy} onClick={() => remove(a)} className="ml-auto text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      {storageConfigured ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <span className="text-xs text-slate-500">{busy ? "처리 중…" : (note ?? "PDF · 4MB까지")}</span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">파일 저장소(Vercel Blob)가 연결되지 않아 파일을 올릴 수 없습니다.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
