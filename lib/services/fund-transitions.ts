import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatDate, formatKRW } from "@/lib/format";
import { FUND_STATUSES, FUND_STATUS_LABEL, type FundStatus, type FundType, type GpType } from "@/lib/labels";
import { getFundMinimum } from "@/lib/rules/fund-minimums";
import { recordEvent } from "@/lib/services/events";

// 조합 상태 이동 (04 업무 규칙 2-1)
// ① 기획 → 모집 (BR-FUND-01) · ② 모집 → 결성 (BR-FUND-02) · ③ 결성 → 운용 (BR-FUND-03)
// ④ 해산·⑤ 청산은 R6에서 조건과 함께 추가한다.

export type TransitionCondition = { rule: string; label: string; met: boolean; hint?: string };
export type TransitionCheck = { from_status: FundStatus; to_status: FundStatus; ready: boolean; conditions: TransitionCondition[] };

// 지금 제공하는 다음 단계 (화면이 체크리스트를 띄울지 판단하는 데 쓴다)
export const SUPPORTED_NEXT: Partial<Record<FundStatus, FundStatus>> = {
  planning: "fundraising",
  fundraising: "formed",
  formed: "operating",
};

type FundRow = { status: FundStatus; fund_type: FundType; gp_type: GpType; registration_completed_date: string | null };

// ② 결성 조건. 결성일(= 결성 안건이 가결된 결성총회일)도 함께 돌려준다
async function formationConditions(tx: typeof sql, fundId: string, fund: FundRow) {
  const [roster] = await tx`select 1 from fund_rosters where fund_id = ${fundId} and cancelled_at is null`;
  const [lead] = await tx`select 1 from fund_managers where fund_id = ${fundId} and role = 'lead' and end_date is null`;
  const [{ total }] = await tx<{ total: number }[]>`
    select coalesce(sum(amount), 0)::bigint as total from ledger_entries where fund_id = ${fundId} and entry_type = 'commitment'
  `;
  const [meeting] = await tx<{ meeting_date: string }[]>`
    select g.meeting_date from agendas a join general_meetings g on g.id = a.meeting_id
    where g.fund_id = ${fundId} and a.agenda_type = 'formation' and a.result = 'passed'
    order by g.meeting_date desc limit 1
  `;
  const [call] = await tx`select 1 from capital_calls where fund_id = ${fundId} and is_initial and status in ('issued', 'closed')`;
  const { minFundAmount, basis } = getFundMinimum(fund.fund_type, fund.gp_type);

  const conditions: TransitionCondition[] = [
    { rule: "BR-MEM-01", label: "조합원 명부 확정", met: Boolean(roster), hint: "조합원 명부 화면에서 명부를 확정하세요" },
    { rule: "BR-MGR-03", label: "대표펀드매니저 지정", met: Boolean(lead), hint: "조합 화면의 운용 인력에서 대표펀드매니저를 지정하세요" },
    minFundAmount === null
      ? { rule: "D29", label: `최소 결성액 (${basis})`, met: true, hint: "이 조합 유형은 최소 결성액 기준을 확인 중이라 검사하지 않습니다" }
      : {
          rule: "D29",
          label: `약정 총액 ${formatKRW(total)} ≥ 최소 결성액 ${formatKRW(minFundAmount)}`,
          met: total >= minFundAmount,
          hint: "명부를 취소하고 약정액을 늘려 다시 확정하세요",
        },
    {
      rule: "BR-FUND-02",
      label: meeting ? `결성총회 결성 안건 가결 (${formatDate(meeting.meeting_date)})` : "결성총회 결성 안건 가결",
      met: Boolean(meeting),
      hint: "총회 화면에서 결성총회를 열고 결성 안건을 가결하세요",
    },
    { rule: "D19", label: "최초 납입 캐피탈콜 발송", met: Boolean(call), hint: "캐피탈콜 화면에서 최초 납입을 발송하세요 (납입 완료까지는 요구하지 않음)" },
  ];
  return { conditions, formationDate: meeting?.meeting_date ?? null };
}

async function loadConditions(tx: typeof sql, fundId: string, fund: FundRow, to: FundStatus) {
  const from = fund.status;
  // BR-FUND-06: 상태는 한 단계씩 앞으로만 이동한다
  if (FUND_STATUSES.indexOf(to) !== FUND_STATUSES.indexOf(from) + 1) {
    throw new AppError(409, "INVALID_FUND_TRANSITION", `${FUND_STATUS_LABEL[from]}에서 ${FUND_STATUS_LABEL[to]}(으)로 이동할 수 없습니다`, "BR-FUND-06");
  }

  if (to === "fundraising") {
    // BR-FUND-01: 규약 버전 1의 필수 조건이 모두 입력됨
    const [terms] = await tx<{ primary_purpose: string; unit_amount: number }[]>`
      select primary_purpose, unit_amount from fund_terms where fund_id = ${fundId} and version = 1
    `;
    return {
      conditions: [
        { rule: "BR-FUND-01", label: "규약 버전 1 필수 조건 입력", met: Boolean(terms?.primary_purpose.trim() && terms.unit_amount > 0), hint: "조합 수정 화면에서 규약 핵심 조건을 입력하세요" },
      ],
      formationDate: null,
    };
  }
  if (to === "formed") return formationConditions(tx, fundId, fund);
  if (to === "operating") {
    // BR-FUND-03: 등록 완료일 입력됨 ⚠️ 등록 기관·절차는 조합 유형마다 다름
    return {
      conditions: [
        {
          rule: "BR-FUND-03",
          label: fund.registration_completed_date ? `등록 완료 (${formatDate(fund.registration_completed_date)})` : "등록 완료일 입력",
          met: Boolean(fund.registration_completed_date),
          hint: "조합 화면의 등록 정보에서 등록 완료일을 입력하세요",
        },
      ],
      formationDate: null,
    };
  }
  throw new AppError(409, "TRANSITION_NOT_SUPPORTED", `${FUND_STATUS_LABEL[to]} 단계로의 이동은 아직 제공하지 않습니다`, "BR-FUND-04");
}

async function loadFund(tx: typeof sql, fundId: string, lock: boolean) {
  assertUuid(fundId, "조합을");
  const [fund] = lock
    ? await tx<FundRow[]>`select status, fund_type, gp_type, registration_completed_date from funds where id = ${fundId} for update`
    : await tx<FundRow[]>`select status, fund_type, gp_type, registration_completed_date from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  return fund;
}

export async function checkTransition(fundId: string, to: FundStatus): Promise<TransitionCheck> {
  const fund = await loadFund(sql, fundId, false);
  const { conditions } = await loadConditions(sql, fundId, fund, to);
  return { from_status: fund.status, to_status: to, ready: conditions.every((c) => c.met), conditions };
}

export async function transitionFund(fundId: string, to: FundStatus) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);

    const { conditions, formationDate } = await loadConditions(t, fundId, fund, to);
    const unmet = conditions.filter((c) => !c.met);
    if (unmet.length > 0) {
      throw new AppError(422, "FUND_TRANSITION_NOT_READY", "다음 단계로 넘어가기 위한 조건이 충족되지 않았습니다", unmet[0].rule, {
        unmet_conditions: unmet,
      });
    }

    if (to === "formed") {
      // BR-FUND-02: 결성일 = 결성총회일. 규약 버전 1은 결성일부터 적용되고, 이후 변경은 총회 가결로만 (상태로 잠김)
      await tx`update funds set status = 'formed', formation_date = ${formationDate} where id = ${fundId}`;
      await tx`update fund_terms set effective_date = ${formationDate} where fund_id = ${fundId} and version = 1`;
    } else {
      await tx`update funds set status = ${to} where id = ${fundId}`;
    }
    await recordEvent(t, {
      event_type: "fund.status_changed",
      aggregate_type: "fund",
      aggregate_id: fundId,
      lp_id: null,
      fund_id: fundId,
      data: { from_status: fund.status, to_status: to, ...(to === "formed" ? { formation_date: formationDate } : {}) },
    });
  });
}
