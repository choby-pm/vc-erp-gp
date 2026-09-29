import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";

// 파일 첨부 (D41): 규약 원문(규약 버전별) · 정기 보고 PDF
// · 파일은 비공개 Vercel Blob 에, 메타데이터는 attachments 테이블에 둔다. Blob 주소는 화면·LP에 주지 않는다
// · 내려받기는 로그인(GP) 또는 LP 연동 API 키 + 조합원 확인(LP)을 거친 서버 경로로만 흘려보낸다
// · PDF만, 파일당 4MB까지 (서버를 거쳐 올리므로 Vercel 함수 요청 크기 4.5MB 제한 안쪽) ⚠️
// · 지우면 목록·LP에서 빠지고 기록은 남는다 (Blob 파일도 남긴다: 누가 무엇을 봤는지 추적할 수 있게)

export type AttachmentTarget = "fund_terms" | "report";
export const ATTACHMENT_TARGETS: AttachmentTarget[] = ["fund_terms", "report"];
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type Attachment = {
  id: string;
  target_type: AttachmentTarget;
  target_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: Date;
};

// Blob 인증: 연결된 스토어의 OIDC(BLOB_STORE_ID) 또는 읽기·쓰기 토큰(BLOB_READ_WRITE_TOKEN)
export function storageConfigured() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

const storageMissing = () =>
  new AppError(503, "STORAGE_NOT_CONFIGURED", "파일 저장소(Vercel Blob)가 연결되지 않았습니다. 관리자에게 문의하세요");

// 첨부할 대상이 이 조합의 것인지 확인한다. 보고서는 발행 여부도 돌려준다 (LP 공개 조건)
async function loadTarget(fundId: string, type: AttachmentTarget, targetId: string) {
  assertUuid(targetId, type === "report" ? "보고서를" : "규약 버전을");
  if (type === "report") {
    const [r] = await sql<{ status: string }[]>`select status from reports where id = ${targetId} and fund_id = ${fundId}`;
    if (!r) throw notFound("보고서를");
    return { published: r.status === "published" };
  }
  const [t] = await sql`select 1 from fund_terms where id = ${targetId} and fund_id = ${fundId}`;
  if (!t) throw notFound("규약 버전을");
  return { published: true };
}

export async function listAttachments(fundId: string, type: AttachmentTarget, targetId: string) {
  assertUuid(fundId, "조합을");
  await loadTarget(fundId, type, targetId);
  return sql<Attachment[]>`
    select a.id, a.target_type, a.target_id, a.file_name, a.content_type, a.size_bytes, u.name as uploaded_by_name, a.created_at
    from attachments a
    left join users u on u.id = a.uploaded_by
    where a.fund_id = ${fundId} and a.target_type = ${type} and a.target_id = ${targetId} and a.deleted_at is null
    order by a.created_at
  `;
}

const fail = (message: string) => new AppError(422, "VALIDATION_ERROR", message, "BR-FILE-01", { fields: { file: message } });

export async function uploadAttachment(fundId: string, type: AttachmentTarget, targetId: string, file: File, userId: string) {
  assertUuid(fundId, "조합을");
  await loadTarget(fundId, type, targetId);
  if (!storageConfigured()) throw storageMissing();

  // BR-FILE-01: PDF만, 4MB까지. 확장자·형식 표시만 믿지 않고 파일 앞부분(%PDF-)을 확인한다
  if (file.size === 0) throw fail("빈 파일입니다");
  if (file.size > MAX_ATTACHMENT_BYTES) throw fail("파일은 4MB까지 올릴 수 있습니다");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw fail("PDF 파일만 올릴 수 있습니다");
  const fileName = (file.name || "document.pdf").replace(/[\\/\r\n"]/g, "_").slice(0, 200);

  const id = randomUUID();
  const pathname = `funds/${fundId}/${type}/${targetId}/${id}.pdf`;
  await put(pathname, bytes, { access: "private", contentType: "application/pdf", addRandomSuffix: false });
  try {
    await sql`
      insert into attachments (id, fund_id, target_type, target_id, file_name, content_type, size_bytes, blob_pathname, uploaded_by)
      values (${id}, ${fundId}, ${type}, ${targetId}, ${fileName}, 'application/pdf', ${file.size}, ${pathname}, ${userId})
    `;
  } catch (err) {
    await del(pathname).catch(() => {}); // 기록이 실패하면 올린 파일도 지운다
    throw err;
  }
  return { id };
}

export async function deleteAttachment(fundId: string, attachmentId: string, userId: string) {
  assertUuid(fundId, "조합을");
  assertUuid(attachmentId, "첨부 파일을");
  const [row] = await sql`
    update attachments set deleted_at = now(), deleted_by = ${userId}
    where id = ${attachmentId} and fund_id = ${fundId} and deleted_at is null
    returning id
  `;
  if (!row) throw notFound("첨부 파일을");
}

// 내려받기: 메타데이터 + Blob 스트림. lp 가 있으면 LP 공개 조건(발행된 보고서만)을 함께 검사한다
export async function openAttachment(fundId: string, attachmentId: string, options: { lpOnly?: boolean } = {}) {
  assertUuid(fundId, "조합을");
  assertUuid(attachmentId, "첨부 파일을");
  const [a] = await sql<{ file_name: string; content_type: string; blob_pathname: string; target_type: AttachmentTarget; target_id: string }[]>`
    select file_name, content_type, blob_pathname, target_type, target_id from attachments
    where id = ${attachmentId} and fund_id = ${fundId} and deleted_at is null
  `;
  if (!a) throw notFound("첨부 파일을");
  if (options.lpOnly && !(await loadTarget(fundId, a.target_type, a.target_id)).published) throw notFound("첨부 파일을");
  if (!storageConfigured()) throw storageMissing();
  const blob = await get(a.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw notFound("첨부 파일을");
  return { file_name: a.file_name, content_type: a.content_type, stream: blob.stream };
}

// 파일 응답: 브라우저에서 바로 열리게(inline), 한글 파일 이름은 RFC 5987 로
export function fileResponse(file: { file_name: string; content_type: string; stream: ReadableStream<Uint8Array> }) {
  return new Response(file.stream, {
    headers: {
      "Content-Type": file.content_type,
      "Content-Disposition": `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// LP 연동 응답용: 대상별 첨부 목록 (id·이름·크기만)
export async function publicAttachments(type: AttachmentTarget, targetIds: string[]) {
  if (targetIds.length === 0) return new Map<string, { id: string; file_name: string; size_bytes: number }[]>();
  const rows = await sql<{ id: string; target_id: string; file_name: string; size_bytes: number }[]>`
    select id, target_id, file_name, size_bytes from attachments
    where target_type = ${type} and target_id in ${sql(targetIds)} and deleted_at is null order by created_at
  `;
  const map = new Map<string, { id: string; file_name: string; size_bytes: number }[]>();
  for (const r of rows) map.set(r.target_id, [...(map.get(r.target_id) ?? []), { id: r.id, file_name: r.file_name, size_bytes: r.size_bytes }]);
  return map;
}
