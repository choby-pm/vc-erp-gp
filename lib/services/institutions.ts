import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { INSTITUTION_TYPE_LABEL, type FundStatus, type InstitutionType } from "@/lib/labels";
import type { InstitutionInput, RegistrationInput } from "@/lib/schemas/institution";
import { recordEvent } from "@/lib/services/events";

// 관계 기관과 조합 등록 정보 (단계 3. 결성)
// · 관계 기관(수탁은행·사무관리사·회계감사인)은 조합당 종류별 1곳. 청산 전까지 바꿀 수 있다
// · 등록 정보는 결성 이후 입력한다. 등록 완료일이 있어야 운용을 시작할 수 있다 (BR-FUND-03)
// · 둘 다 LP에게 공개되는 조합 정보라 바뀌면 연동 이벤트를 남긴다 (BR-EVT-01)

export type Institution = {
  id: string;
  institution_type: InstitutionType;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus; formation_date: string | null }[]>`
    select status, formation_date from funds where id = ${fundId} for update
  `;
  if (!fund) throw notFound("조합을");
  return fund;
}

const fundUpdated = (tx: typeof sql, fundId: string, data: Record<string, unknown>) =>
  recordEvent(tx, { event_type: "fund.updated", aggregate_type: "fund", aggregate_id: fundId, lp_id: null, fund_id: fundId, data });

// ─── 관계 기관 ─────────────────────────────────────────────────────────────

export async function listInstitutions(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql`select 1 from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  return sql<Institution[]>`
    select id, institution_type, name, contact_name, contact_email, contact_phone
    from related_institutions where fund_id = ${fundId}
    order by case institution_type when 'custodian' then 1 when 'administrator' then 2 else 3 end
  `;
}

async function assertEditable(tx: typeof sql, fundId: string) {
  const fund = await lockFund(tx, fundId);
  if (fund.status === "liquidated") throw statusNotAllowed("BR-FUND-08", "청산이 끝난 조합은 관계 기관을 바꿀 수 없습니다");
}

async function assertTypeFree(tx: typeof sql, fundId: string, type: InstitutionType, exceptId?: string) {
  const [dup] = await tx<{ name: string }[]>`
    select name from related_institutions
    where fund_id = ${fundId} and institution_type = ${type} and id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
  `;
  if (dup) {
    const message = `${INSTITUTION_TYPE_LABEL[type]}은(는) 이미 등록되어 있습니다 (${dup.name}). 기존 기관을 수정하세요`;
    throw new AppError(409, "DUPLICATE_INSTITUTION", message, "BR-INST-01", { fields: { institution_type: message } });
  }
}

export async function createInstitution(fundId: string, input: InstitutionInput, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await assertEditable(t, fundId);
    await assertTypeFree(t, fundId, input.institution_type);
    const [created] = await tx<{ id: string }[]>`
      insert into related_institutions ${tx({ ...input, fund_id: fundId, created_by: userId })} returning id
    `;
    await fundUpdated(t, fundId, { changed: "institution", action: "created", institution_id: created.id, institution_type: input.institution_type, name: input.name });
  });
}

export async function updateInstitution(fundId: string, institutionId: string, input: InstitutionInput) {
  assertUuid(institutionId, "관계 기관을");
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await assertEditable(t, fundId);
    await assertTypeFree(t, fundId, input.institution_type, institutionId);
    const [updated] = await tx`
      update related_institutions set ${tx(input, "institution_type", "name", "contact_name", "contact_email", "contact_phone")}
      where id = ${institutionId} and fund_id = ${fundId} returning id
    `;
    if (!updated) throw notFound("관계 기관을");
    await fundUpdated(t, fundId, { changed: "institution", action: "updated", institution_id: institutionId, institution_type: input.institution_type, name: input.name });
  });
}

export async function deleteInstitution(fundId: string, institutionId: string) {
  assertUuid(institutionId, "관계 기관을");
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await assertEditable(t, fundId);
    const [deleted] = await tx<{ institution_type: InstitutionType }[]>`
      delete from related_institutions where id = ${institutionId} and fund_id = ${fundId} returning institution_type
    `;
    if (!deleted) throw notFound("관계 기관을");
    await fundUpdated(t, fundId, { changed: "institution", action: "deleted", institution_id: institutionId, institution_type: deleted.institution_type });
  });
}

// ─── 등록 정보 ─────────────────────────────────────────────────────────────

// 결성 이후, 운용 시작 전까지 입력·수정한다. 운용을 시작하면 등록 완료일이 근거라 잠근다
export async function updateRegistration(fundId: string, input: RegistrationInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    if (fund.status !== "formed") {
      throw statusNotAllowed("BR-FUND-03", fund.status === "planning" || fund.status === "fundraising" ? "등록 정보는 결성 이후에 입력합니다" : "운용을 시작한 조합은 등록 정보를 바꿀 수 없습니다");
    }
    const invalid = (field: string, message: string) => new AppError(422, "INVALID_DATE", message, "BR-FUND-03", { fields: { [field]: message } });
    if (fund.formation_date && input.registration_applied_date < fund.formation_date) {
      throw invalid("registration_applied_date", `등록 신청일은 결성일(${fund.formation_date}) 이후여야 합니다`);
    }
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (input.registration_completed_date && input.registration_completed_date > today) {
      throw invalid("registration_completed_date", "등록 완료일은 오늘 이후로 입력할 수 없습니다");
    }
    await tx`
      update funds set registration_applied_date = ${input.registration_applied_date},
                       registration_completed_date = ${input.registration_completed_date}
      where id = ${fundId}
    `;
    await fundUpdated(t, fundId, { changed: "registration", ...input });
  });
}
