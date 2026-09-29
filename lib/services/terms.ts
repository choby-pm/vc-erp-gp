import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { AgendaType, FundStatus, FundType, GpType } from "@/lib/labels";
import { getFundMinimum } from "@/lib/rules/fund-minimums";
import type { NewTermsInput } from "@/lib/schemas/fund";
import { recordEvent } from "@/lib/services/events";

// 규약 버전 관리 (BR-TERM-01~05)
// · 결성 이후 규약은 고치지 않고 새 버전을 쌓는다. 새 버전은 가결된 규약 변경 안건 1건당 1개 (BR-TERM-02)
// · 새 버전의 적용일은 총회일 이후 (BR-TERM-03). 어떤 날짜의 규약 = 적용일이 그날 이전인 버전 중 최신 (BR-TERM-04)
// · 규약은 LP에게 공개되는 조합 정보라 새 버전을 만들면 연동 이벤트를 남긴다 (BR-EVT-01)

export const TERM_RATIO_KEYS = [
  "primary_purpose_min_ratio",
  "gp_commitment_min_ratio",
  "management_fee_rate",
  "management_fee_rate_after",
  "carry_rate",
  "hurdle_rate",
  "quorum_ratio",
] as const;

export type TermsVersion = {
  id: string;
  version: number;
  primary_purpose: string;
  unit_amount: number;
  primary_purpose_min_ratio: number;
  gp_commitment_min_ratio: number;
  management_fee_rate: number;
  management_fee_rate_after: number;
  carry_rate: number;
  hurdle_rate: number;
  quorum_ratio: number;
  effective_date: string;
  agenda: { id: string; title: string; meeting_date: string } | null; // 근거 안건 (버전 1은 없음)
  created_at: Date;
};

const selectVersions = (fundId: string) => sql<TermsVersion[]>`
  select t.id, t.version, t.primary_purpose, t.unit_amount,
         t.primary_purpose_min_ratio::float8 as primary_purpose_min_ratio, t.gp_commitment_min_ratio::float8 as gp_commitment_min_ratio,
         t.management_fee_rate::float8 as management_fee_rate, t.management_fee_rate_after::float8 as management_fee_rate_after,
         t.carry_rate::float8 as carry_rate, t.hurdle_rate::float8 as hurdle_rate, t.quorum_ratio::float8 as quorum_ratio,
         t.effective_date, t.created_at,
         case when a.id is null then null else json_build_object('id', a.id, 'title', a.title, 'meeting_date', g.meeting_date) end as agenda
  from fund_terms t
  left join agendas a on a.id = t.amended_by_agenda_id
  left join general_meetings g on g.id = a.meeting_id
  where t.fund_id = ${fundId}
  order by t.version desc
`;

export async function listTermsVersions(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const versions = await selectVersions(fundId);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return {
    fund_status: fund.status,
    can_amend: fund.status === "formed" || fund.status === "operating", // 04 업무 규칙 2-2
    effective_version: versions.find((v) => v.effective_date <= today)?.version ?? versions.at(-1)?.version ?? 1,
    versions,
  };
}

// BR-TERM-04: 그 날짜에 적용되는 버전. 결성 전(적용일이 미래인 버전 1뿐)이면 버전 1
export async function termsEffectiveAt(fundId: string, date: string) {
  const { versions } = await listTermsVersions(fundId);
  return versions.find((v) => v.effective_date <= date) ?? versions.at(-1)!;
}

// 가결된 안건 중 아직 규약 새 버전에 쓰지 않은 것 (규약 변경 화면의 선택지)
export async function listPassedAgendas(fundId: string, type: AgendaType) {
  return sql<{ id: string; title: string; meeting_date: string; used_by_version: number | null }[]>`
    select a.id, a.title, g.meeting_date,
           (select t.version from fund_terms t where t.amended_by_agenda_id = a.id) as used_by_version
    from agendas a join general_meetings g on g.id = a.meeting_id
    where g.fund_id = ${fundId} and a.agenda_type = ${type} and a.result = 'passed'
    order by g.meeting_date desc, a.agenda_no
  `;
}

// BR-TERM-02·03: 가결된 규약 변경 안건 1건당 새 버전 1개, 적용일 ≥ 총회일 (그리고 직전 버전 적용일 이후)
export async function createTermsVersion(fundId: string, input: NewTermsInput, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: FundStatus; fund_type: FundType; gp_type: GpType }[]>`
      select status, fund_type, gp_type from funds where id = ${fundId} for update
    `;
    if (!fund) throw notFound("조합을");
    if (fund.status !== "formed" && fund.status !== "operating") {
      throw statusNotAllowed("BR-FUND-08", fund.status === "planning" || fund.status === "fundraising" ? "결성 전에는 규약 버전 1을 직접 수정하세요" : "현재 조합 상태에서는 규약을 바꿀 수 없습니다");
    }

    const [agenda] = await tx<{ agenda_type: AgendaType; result: string; meeting_date: string }[]>`
      select a.agenda_type, a.result, g.meeting_date from agendas a join general_meetings g on g.id = a.meeting_id
      where a.id = ${input.agenda_id} and g.fund_id = ${fundId}
    `;
    const fail = (status: number, code: string, message: string, rule: string, field: string) =>
      new AppError(status, code, message, rule, { fields: { [field]: message } });
    if (!agenda || agenda.agenda_type !== "terms_amendment" || agenda.result !== "passed") {
      throw fail(409, "AGENDA_NOT_PASSED", "가결된 규약 변경 안건이 있어야 새 버전을 만들 수 있습니다", "BR-TERM-02", "agenda_id");
    }
    const [used] = await tx<{ version: number }[]>`select version from fund_terms where amended_by_agenda_id = ${input.agenda_id}`;
    if (used) throw fail(409, "AGENDA_ALREADY_USED", `이 안건으로 이미 규약 버전 ${used.version}을 만들었습니다. 안건 하나당 새 버전 하나입니다`, "BR-TERM-02", "agenda_id");
    if (input.effective_date < agenda.meeting_date) {
      throw fail(422, "INVALID_DATE", `적용일은 총회일(${formatDate(agenda.meeting_date)}) 이후여야 합니다`, "BR-TERM-03", "effective_date");
    }
    const [latest] = await tx<{ version: number; effective_date: string }[]>`
      select version, effective_date from fund_terms where fund_id = ${fundId} order by version desc limit 1
    `;
    if (input.effective_date < latest.effective_date) {
      throw fail(422, "INVALID_DATE", `적용일은 직전 버전(${latest.version})의 적용일(${formatDate(latest.effective_date)}) 이후여야 합니다`, "BR-TERM-04", "effective_date");
    }
    // BR-TERM-05: 1좌 금액 최소 기준 (개인투자조합)
    const { minUnitAmount, basis } = getFundMinimum(fund.fund_type, fund.gp_type);
    if (minUnitAmount !== null && input.unit_amount < minUnitAmount) {
      throw fail(422, "INVALID_UNIT_AMOUNT", `1좌 금액은 최소 ${minUnitAmount.toLocaleString("ko-KR")}원 이상이어야 합니다 (${basis})`, "BR-TERM-05", "unit_amount");
    }

    const version = latest.version + 1;
    const { agenda_id: agendaId, ...terms } = input;
    await tx`
      insert into fund_terms ${tx({ ...terms, fund_id: fundId, version, amended_by_agenda_id: agendaId, created_by: userId })}
    `;
    await recordEvent(t, {
      event_type: "fund.terms_updated",
      aggregate_type: "fund",
      aggregate_id: fundId,
      lp_id: null,
      fund_id: fundId,
      data: { version, effective_date: input.effective_date, ...Object.fromEntries(TERM_RATIO_KEYS.map((k) => [k, input[k]])), primary_purpose: input.primary_purpose, unit_amount: input.unit_amount },
    });
    return { version };
  });
}
