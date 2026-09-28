import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRW, formatPercent } from "@/lib/format";
import type { FundStatus, FundType, GpType } from "@/lib/labels";
import { getFundMinimum } from "@/lib/rules/fund-minimums";
import type { ConfirmRosterInput } from "@/lib/schemas/roster";
import { recordEvent } from "@/lib/services/events";
import { addLedgerEntry } from "@/lib/services/ledger";

// 조합원 명부 서비스 (단계 3. 결성, BR-MEM-01~07, D33)
// · 명부 확정 = 확약(약속)을 약정(법적 금액)으로 바꾸는 작업. 조합원 + 약정 원장 + 연동 이벤트를 한 트랜잭션으로 저장한다
// · 약정액은 fund_members 에 저장하지 않는다. 원장 합계가 유일한 원본이다 (v_member_balances)
// · 명부를 취소해도 조합원 행과 원장 행은 지우지 않는다. 원장은 취소 행(음수)으로 되돌리고, 다시 확정하면 조합원 행을 재사용한다

export type RosterMember = {
  member_id: string;
  member_type: "gp" | "lp";
  lp_id: string | null;
  lp_name: string | null; // GP는 null
  proposal_id: string | null;
  loc_amount: number | null; // 확약 금액 (참고)
  commitment_amount: number;
  ownership_ratio: number; // 지분율 = 약정액 ÷ 약정 총액
  called_amount: number;
  paid_amount: number;
  unfunded_amount: number; // 잔여 약정 = 약정 - 요청
};

export type RosterCandidate = { proposal_id: string; lp_id: string; lp_name: string; loc_amount: number; decided_date: string | null };

export type FundRoster = {
  fund_status: FundStatus;
  unit_amount: number;
  gp_commitment_min_ratio: number;
  target_amount: number;
  min_fund_amount: number | null;
  roster: { id: string; confirmed_date: string } | null; // 유효한 명부
  cancelled: { confirmed_date: string; cancelled_at: Date; cancel_reason: string | null }[]; // 취소 이력
  members: RosterMember[]; // 유효한 명부의 조합원 (약정액 > 0). GP가 먼저
  totals: { commitment_amount: number; gp_commitment_amount: number; gp_ratio: number; lp_count: number };
  candidates: RosterCandidate[]; // 확약된 출자 제안 (명부 확정 후보)
  can_confirm: boolean;
  cancel_blocked_reason: string | null; // 명부가 있을 때 취소할 수 없는 이유 (없으면 취소 가능)
};

// ─── 조회 ──────────────────────────────────────────────────────────────────

type FundRow = { status: FundStatus; target_amount: number; fund_type: FundType; gp_type: GpType; unit_amount: number; gp_commitment_min_ratio: string };

async function loadFund(tx: typeof sql, fundId: string, lock: boolean) {
  assertUuid(fundId, "조합을");
  // 명부 확정은 결성 전이라 규약 버전 1을 기준으로 한다
  const [fund] = lock
    ? await tx<FundRow[]>`
        select f.status, f.target_amount, f.fund_type, f.gp_type, t.unit_amount, t.gp_commitment_min_ratio
        from funds f join fund_terms t on t.fund_id = f.id and t.version = 1
        where f.id = ${fundId}
        for update of f
      `
    : await tx<FundRow[]>`
        select f.status, f.target_amount, f.fund_type, f.gp_type, t.unit_amount, t.gp_commitment_min_ratio
        from funds f join fund_terms t on t.fund_id = f.id and t.version = 1
        where f.id = ${fundId}
      `;
  if (!fund) throw notFound("조합을");
  return { ...fund, gp_commitment_min_ratio: Number(fund.gp_commitment_min_ratio) };
}

// BR-MEM-05: 결성총회에서 결성 안건이 가결됐거나, 최초 캐피탈콜을 만들었으면 명부를 취소할 수 없다
async function cancelBlockedReason(tx: typeof sql, fundId: string, status: FundStatus): Promise<string | null> {
  if (status !== "fundraising") return "결성 이후에는 명부를 바꿀 수 없습니다";
  const [passed] = await tx`
    select 1 from agendas a join general_meetings g on g.id = a.meeting_id
    where g.fund_id = ${fundId} and a.agenda_type = 'formation' and a.result = 'passed'
  `;
  if (passed) return "결성총회에서 결성 안건이 가결되어 명부를 취소할 수 없습니다";
  // 예정된 결성총회의 의결권이 이 명부 기준이라, 총회를 먼저 취소해야 한다
  const [meeting] = await tx`select 1 from general_meetings where fund_id = ${fundId} and meeting_type = 'formation' and status = 'scheduled'`;
  if (meeting) return "결성총회가 예정되어 있어 명부를 취소할 수 없습니다. 먼저 총회를 취소하세요";
  const [call] = await tx`select 1 from capital_calls where fund_id = ${fundId}`;
  if (call) return "캐피탈콜이 만들어져 있어 명부를 취소할 수 없습니다. 초안이면 먼저 삭제하세요";
  return null;
}

export async function getRoster(fundId: string): Promise<FundRoster> {
  const fund = await loadFund(sql, fundId, false);

  const rosters = await sql<{ id: string; confirmed_date: string; cancelled_at: Date | null; cancel_reason: string | null }[]>`
    select id, confirmed_date, cancelled_at, cancel_reason from fund_rosters where fund_id = ${fundId} order by created_at desc
  `;
  const active = rosters.find((r) => r.cancelled_at === null) ?? null;

  const members = await sql<RosterMember[]>`
    select b.member_id, b.member_type, b.lp_id, lp.name as lp_name, m.proposal_id, p.loc_amount,
           b.commitment_amount, coalesce(b.ownership_ratio, 0)::float8 as ownership_ratio,
           b.called_amount, b.paid_amount, b.unfunded_amount
    from v_member_balances b
    join fund_members m on m.id = b.member_id
    left join limited_partners lp on lp.id = b.lp_id
    left join lp_proposals p on p.id = m.proposal_id
    where b.fund_id = ${fundId} and b.commitment_amount > 0
    order by b.member_type = 'lp', b.commitment_amount desc, lp.name
  `;

  const candidates = await sql<RosterCandidate[]>`
    select p.id as proposal_id, p.lp_id, lp.name as lp_name, p.loc_amount, p.decided_date
    from lp_proposals p join limited_partners lp on lp.id = p.lp_id
    where p.fund_id = ${fundId} and p.status = 'committed'
    order by p.loc_amount desc, lp.name
  `;

  const total = members.reduce((s, m) => s + m.commitment_amount, 0);
  const gp = members.find((m) => m.member_type === "gp")?.commitment_amount ?? 0;

  return {
    fund_status: fund.status,
    unit_amount: fund.unit_amount,
    gp_commitment_min_ratio: fund.gp_commitment_min_ratio,
    target_amount: fund.target_amount,
    min_fund_amount: getFundMinimum(fund.fund_type, fund.gp_type).minFundAmount,
    roster: active && { id: active.id, confirmed_date: active.confirmed_date },
    cancelled: rosters
      .filter((r) => r.cancelled_at !== null)
      .map((r) => ({ confirmed_date: r.confirmed_date, cancelled_at: r.cancelled_at!, cancel_reason: r.cancel_reason })),
    members,
    totals: { commitment_amount: total, gp_commitment_amount: gp, gp_ratio: total > 0 ? gp / total : 0, lp_count: members.length - (gp > 0 ? 1 : 0) },
    candidates,
    can_confirm: fund.status === "fundraising" && !active,
    cancel_blocked_reason: active ? await cancelBlockedReason(sql, fundId, fund.status) : null,
  };
}

// ─── 확정 ──────────────────────────────────────────────────────────────────

const fieldError = (status: number, code: string, message: string, rule: string, field: string) =>
  new AppError(status, code, message, rule, { fields: { [field]: message } });

export async function confirmRoster(fundId: string, input: ConfirmRosterInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true); // BR-COM-02: 조합 행 잠금
    if (fund.status !== "fundraising") throw statusNotAllowed("BR-FUND-08", "조합원 명부는 모집 중인 조합에서만 확정할 수 있습니다");

    const [active] = await tx`select 1 from fund_rosters where fund_id = ${fundId} and cancelled_at is null`;
    if (active) throw new AppError(409, "ROSTER_ALREADY_CONFIRMED", "이미 확정된 명부가 있습니다. 바꾸려면 먼저 명부를 취소하세요", "BR-MEM-05");

    // BR-MEM-01: 이 조합의 확약된 제안만. 같은 제안을 두 번 넣을 수 없다
    const ids = input.members.map((m) => m.proposal_id);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(422, "VALIDATION_ERROR", "같은 출자자가 두 번 들어 있습니다", "BR-MEM-01");
    }
    const proposals = await tx<{ id: string; lp_id: string; status: string; name: string }[]>`
      select p.id, p.lp_id, p.status, lp.name from lp_proposals p join limited_partners lp on lp.id = p.lp_id
      where p.fund_id = ${fundId} and p.id in ${tx(ids)}
    `;
    const byId = new Map(proposals.map((p) => [p.id, p]));
    input.members.forEach((m, i) => {
      const p = byId.get(m.proposal_id);
      if (!p) throw fieldError(422, "VALIDATION_ERROR", "이 조합의 출자 제안이 아닙니다", "BR-MEM-01", `members.${i}.proposal_id`);
      if (p.status !== "committed") {
        throw fieldError(422, "PROPOSAL_NOT_COMMITTED", `${p.name}의 제안은 확약되지 않아 조합원이 될 수 없습니다`, "BR-MEM-01", `members.${i}.proposal_id`);
      }
    });

    // BR-MEM-07: 약정액은 1좌 금액의 배수
    const unit = fund.unit_amount;
    const notMultiple = (amount: number) => amount % unit !== 0;
    if (notMultiple(input.gp_commitment_amount)) {
      throw fieldError(422, "COMMITMENT_NOT_UNIT_MULTIPLE", `GP 약정액은 1좌 금액(${formatKRW(unit)})의 배수여야 합니다`, "BR-MEM-07", "gp_commitment_amount");
    }
    input.members.forEach((m, i) => {
      if (notMultiple(m.commitment_amount)) {
        const name = byId.get(m.proposal_id)!.name;
        throw fieldError(422, "COMMITMENT_NOT_UNIT_MULTIPLE", `${name}의 약정액은 1좌 금액(${formatKRW(unit)})의 배수여야 합니다`, "BR-MEM-07", `members.${i}.commitment_amount`);
      }
    });

    // BR-MEM-03: GP 약정액 ÷ 약정 총액 ≥ GP 의무 출자 비율
    const total = input.gp_commitment_amount + input.members.reduce((s, m) => s + m.commitment_amount, 0);
    const gpRatio = input.gp_commitment_amount / total;
    if (gpRatio < fund.gp_commitment_min_ratio) {
      const minGp = Math.ceil((total * fund.gp_commitment_min_ratio) / unit) * unit;
      throw new AppError(
        422,
        "GP_COMMITMENT_BELOW_MIN",
        `GP 출자 비율(${formatPercent(gpRatio, 2)})이 규약의 최소 비율(${formatPercent(fund.gp_commitment_min_ratio)})보다 낮습니다`,
        "BR-MEM-03",
        {
          gp_ratio: gpRatio,
          min_ratio: fund.gp_commitment_min_ratio,
          fields: { gp_commitment_amount: `약 ${formatKRW(minGp)} 이상 필요합니다 (현재 약정 총액 기준)` },
        },
      );
    }

    // 명부 확정 기록 = 약정 원장의 원인 문서 (D33)
    const [roster] = await tx<{ id: string }[]>`
      insert into fund_rosters (fund_id, confirmed_date, created_by)
      values (${fundId}, ${input.confirmed_date}, ${userId})
      returning id
    `;

    // 조합원: 예전에 취소된 명부에 있던 조합원이면 같은 행을 재사용한다 (원장이 참조하므로 지우지 않음)
    const upsertMember = async (type: "gp" | "lp", lpId: string | null, proposalId: string | null) => {
      const [existing] =
        type === "gp"
          ? await tx<{ id: string }[]>`select id from fund_members where fund_id = ${fundId} and member_type = 'gp'`
          : await tx<{ id: string }[]>`select id from fund_members where fund_id = ${fundId} and lp_id = ${lpId}`;
      if (existing) {
        await tx`update fund_members set proposal_id = ${proposalId}, joined_date = ${input.confirmed_date} where id = ${existing.id}`;
        return existing.id;
      }
      const [created] = await tx<{ id: string }[]>`
        insert into fund_members (fund_id, member_type, lp_id, proposal_id, joined_date, created_by)
        values (${fundId}, ${type}, ${lpId}, ${proposalId}, ${input.confirmed_date}, ${userId})
        returning id
      `;
      return created.id;
    };

    const entryBase = { fund_id: fundId, entry_type: "commitment" as const, entry_date: input.confirmed_date, source_type: "formation" as const, source_id: roster.id, created_by: userId };

    const gpMemberId = await upsertMember("gp", null, null);
    await addLedgerEntry(t, { ...entryBase, member_id: gpMemberId, lp_id: null, amount: input.gp_commitment_amount });

    for (const m of input.members) {
      const p = byId.get(m.proposal_id)!;
      const memberId = await upsertMember("lp", p.lp_id, p.id);
      await addLedgerEntry(t, { ...entryBase, member_id: memberId, lp_id: p.lp_id, amount: m.commitment_amount });
      await recordEvent(t, {
        event_type: "member.joined",
        aggregate_type: "fund_member",
        aggregate_id: memberId,
        lp_id: p.lp_id,
        fund_id: fundId,
        data: { member_id: memberId, joined_date: input.confirmed_date, commitment_amount: m.commitment_amount },
      });
    }
    return roster;
  });
}

// ─── 취소 ──────────────────────────────────────────────────────────────────

// BR-MEM-05: 결성총회 가결 전, 캐피탈콜을 만들기 전까지만. 약정 원장은 취소 행으로 되돌린다
export async function cancelRoster(fundId: string, reason: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);
    const [roster] = await tx<{ id: string }[]>`
      select id from fund_rosters where fund_id = ${fundId} and cancelled_at is null for update
    `;
    if (!roster) throw new AppError(409, "ROSTER_NOT_CONFIRMED", "확정된 명부가 없습니다", "BR-MEM-05");

    const blocked = await cancelBlockedReason(t, fundId, fund.status);
    if (blocked) throw new AppError(409, "ROSTER_LOCKED", blocked, "BR-MEM-05");

    const entries = await tx<{ id: string; member_id: string; lp_id: string | null; amount: number }[]>`
      select e.id, e.member_id, m.lp_id, e.amount
      from ledger_entries e join fund_members m on m.id = e.member_id
      where e.source_type = 'formation' and e.source_id = ${roster.id} and e.reversal_of_id is null
        and not exists (select 1 from ledger_entries r where r.reversal_of_id = e.id)
    `;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    for (const e of entries) {
      // BR-LED-02: 취소 행은 조합원·구분·원인 문서가 같고 금액만 반대
      await addLedgerEntry(t, {
        fund_id: fundId,
        member_id: e.member_id,
        lp_id: e.lp_id,
        entry_type: "commitment",
        amount: -e.amount,
        entry_date: today,
        source_type: "formation",
        source_id: roster.id,
        reversal_of_id: e.id,
        memo: `명부 취소: ${reason}`,
        created_by: userId,
      });
    }

    await tx`
      update fund_rosters set cancelled_at = now(), cancelled_by = ${userId}, cancel_reason = ${reason}
      where id = ${roster.id}
    `;
  });
}

// ─── 약정 증액 (BR-MEM-06 ⚠️) ──────────────────────────────────────────────

// 결성 이후 약정 증액: 가결된 규약 변경 안건이 근거. 약정 원장에 행을 추가한다 (source_type = terms_amendment).
// 1좌 배수(BR-MEM-07)와 GP 의무 출자 비율(BR-MEM-03)을 증액 후 기준으로 다시 검사한다. 감액·신규 가입·양도는 고도화
export async function increaseCommitment(
  fundId: string,
  memberId: string,
  input: { agenda_id: string; amount: number; entry_date: string },
  userId: string,
) {
  assertUuid(fundId, "조합을");
  assertUuid(memberId, "조합원을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`; // BR-COM-02
    if (!fund) throw notFound("조합을");
    if (fund.status !== "formed" && fund.status !== "operating") throw statusNotAllowed("BR-MEM-06", "약정 증액은 결성·운용 중인 조합에서만 할 수 있습니다");

    const fail = (status: number, code: string, message: string, rule: string, field: string) =>
      new AppError(status, code, message, rule, { fields: { [field]: message } });
    const [agenda] = await tx<{ meeting_date: string }[]>`
      select g.meeting_date from agendas a join general_meetings g on g.id = a.meeting_id
      where a.id = ${input.agenda_id} and g.fund_id = ${fundId} and a.agenda_type = 'terms_amendment' and a.result = 'passed'
    `;
    if (!agenda) throw fail(409, "AGENDA_NOT_PASSED", "가결된 규약 변경 안건이 있어야 약정을 늘릴 수 있습니다", "BR-MEM-06", "agenda_id");
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (input.entry_date < agenda.meeting_date || input.entry_date > today) {
      throw fail(422, "INVALID_DATE", `증액일은 총회일(${formatDate(agenda.meeting_date)})부터 오늘 사이여야 합니다`, "BR-MEM-06", "entry_date");
    }

    const members = await tx<{ member_id: string; member_type: "gp" | "lp"; lp_id: string | null; name: string; commitment_amount: number }[]>`
      select b.member_id, b.member_type, b.lp_id, coalesce(lp.name, 'GP') as name, b.commitment_amount
      from v_member_balances b left join limited_partners lp on lp.id = b.lp_id
      where b.fund_id = ${fundId} and b.commitment_amount > 0
    `;
    const member = members.find((m) => m.member_id === memberId);
    if (!member) throw notFound("조합원을");

    // 증액일에 적용되는 규약으로 1좌 금액과 GP 의무 비율을 확인한다 (BR-TERM-04)
    const [terms] = await tx<{ unit_amount: number; gp_commitment_min_ratio: string }[]>`
      select unit_amount, gp_commitment_min_ratio from fund_terms where fund_id = ${fundId} and effective_date <= ${input.entry_date}
      order by version desc limit 1
    `;
    if (input.amount % terms.unit_amount !== 0) {
      throw fail(422, "COMMITMENT_NOT_UNIT_MULTIPLE", `증액은 1좌 금액(${formatKRW(terms.unit_amount)})의 배수여야 합니다`, "BR-MEM-07", "amount");
    }
    const total = members.reduce((s, m) => s + m.commitment_amount, 0) + input.amount;
    const gp = (members.find((m) => m.member_type === "gp")?.commitment_amount ?? 0) + (member.member_type === "gp" ? input.amount : 0);
    const min = Number(terms.gp_commitment_min_ratio);
    if (gp / total < min) {
      throw new AppError(422, "GP_COMMITMENT_BELOW_MIN", `증액 후 GP 출자 비율(${formatPercent(gp / total, 2)})이 규약의 최소 비율(${formatPercent(min)})보다 낮아집니다. GP 약정도 함께 늘리세요`, "BR-MEM-03");
    }

    return addLedgerEntry(t, {
      fund_id: fundId,
      member_id: memberId,
      lp_id: member.lp_id,
      entry_type: "commitment",
      amount: input.amount,
      entry_date: input.entry_date,
      source_type: "terms_amendment",
      source_id: input.agenda_id,
      memo: `약정 증액 (${member.name})`,
      created_by: userId,
    });
  });
}

// 명부가 확정된 동안에는 규약 버전 1을 고칠 수 없다 (1좌 금액·GP 의무 출자 비율 검사가 깨지지 않도록, D33)
export async function assertNoActiveRoster(tx: typeof sql, fundId: string) {
  const [active] = await tx`select 1 from fund_rosters where fund_id = ${fundId} and cancelled_at is null`;
  if (active) {
    throw new AppError(409, "ROSTER_CONFIRMED", "조합원 명부가 확정되어 규약을 고칠 수 없습니다. 명부를 취소한 뒤 수정하세요", "BR-MEM-05");
  }
}
