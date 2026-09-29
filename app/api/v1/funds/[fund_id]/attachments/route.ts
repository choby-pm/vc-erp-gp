import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { ATTACHMENT_TARGETS, listAttachments, uploadAttachment, type AttachmentTarget } from "@/lib/services/attachments";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/attachments">;

function target(value: FormDataEntryValue | string | null): AttachmentTarget {
  if (!ATTACHMENT_TARGETS.includes(value as AttachmentTarget)) throw new AppError(400, "VALIDATION_ERROR", "첨부 대상(target_type)이 올바르지 않습니다");
  return value as AttachmentTarget;
}

// GET /api/v1/funds/{fund_id}/attachments?target_type=&target_id= — 규약 버전·보고서의 첨부 목록
export const GET = withUser<Ctx>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const q = new URL(request.url).searchParams;
  return ok(await listAttachments(fund_id, target(q.get("target_type")), q.get("target_id") ?? ""));
});

// POST /api/v1/funds/{fund_id}/attachments — PDF 올리기 (multipart: file, target_type, target_id · 4MB, BR-FILE-01)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new AppError(400, "VALIDATION_ERROR", "올릴 파일을 선택하세요", "BR-FILE-01", { fields: { file: "올릴 파일을 선택하세요" } });
  const type = target(form.get("target_type"));
  const targetId = String(form.get("target_id") ?? "");
  const { id } = await uploadAttachment(fund_id, type, targetId, file, user.id);
  return ok({ id, attachments: await listAttachments(fund_id, type, targetId) }, 201);
});
