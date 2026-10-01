import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { EDITABLE_FUND_STATUSES, MANAGER_ROLE_LABEL, type FundStatus, type ManagerRole } from "@/lib/labels";
import type { AppointManagerInput, EndManagerInput } from "@/lib/schemas/fund-manager";
import { recordEvent } from "@/lib/services/events";

// 조합 운용 인력 서비스 (D32)
// · 조합 × 구성원 × 역할. 교체해도 행을 고치지 않고 해임일을 넣은 뒤 새 행을 추가해 이력을 남긴다 (BR-MGR-05)
// · 기획·모집 중에는 자유롭게 선임·해임하고, 결성 이후에는 가결된 운용 인력 교체 안건이 필요하다 (BR-MGR-04)
// · 운용 인력은 LP에게 공개되는 조합 정보(🔵)라 바뀌면 fund.updated 이벤트를 남긴다 (D45). LP 쪽 핵심 운용 인력 유지 조건 점검용

export type FundManager = {
  id: string;
  staff_id: string;
  employee_no: string;
  name: string;
  position: string;
  staff_left: boolean;
  role: ManagerRole;
  start_date: string;
  end_date: string | null;
  appointed_by_agenda_id: string | null;
  ended_by_agenda_id: string | null;
};

export type FundManagers = {
  current: FundManager[]; // 현재 담당 중 (대표펀드매니저 → 핵심운용인력 → 운용인력 순)
  history: FundManager[]; // 해임된 이력 (최근 해임 순)
  has_lead: boolean; // 결성 조건 (BR-MGR-03)
  changes_need_agenda: boolean; // 결성 이후라 선임·해임에 가결 안건이 필요한지
};

export async function listFundManagers(fundId: string): Promise<FundManagers> {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");

  const rows = await sql<FundManager[]>`
    select m.id, m.staff_id, s.employee_no, s.name, s.position, s.left_date is not null as staff_left,
           m.role, m.start_date, m.end_date, m.appointed_by_agenda_id, m.ended_by_agenda_id
    from fund_managers m
    join staff s on s.id = m.staff_id
    where m.fund_id = ${fundId}
    order by m.end_date desc nulls first,
             case m.role when 'lead' then 1 when 'key' then 2 else 3 end,
             m.start_date, s.name
  `;
  const current = rows.filter((r) => r.end_date === null);
  return {
    current,
    history: rows.filter((r) => r.end_date !== null),
    has_lead: current.some((r) => r.role === "lead"),
    changes_need_agenda: !EDITABLE_FUND_STATUSES.includes(fund.status),
  };
}

// ─── 공통 검사 ─────────────────────────────────────────────────────────────

// 조합 행을 잠가 선임·해임하는 동안 상태가 바뀌지 않게 한다.
// 결성 이후면 가결된 운용 인력 교체 안건을 확인하고 그 ID를 돌려준다 (결성 전에는 안건을 기록하지 않음)
async function lockFundForChange(tx: typeof sql, fundId: string, agendaId: string | null): Promise<string | null> {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`;
  if (!fund) throw notFound("조합을");
  if (fund.status === "liquidated") throw statusNotAllowed("BR-MGR-04", "청산이 끝난 조합은 운용 인력을 바꿀 수 없습니다");
  if (EDITABLE_FUND_STATUSES.includes(fund.status)) return null;

  if (agendaId) {
    const [agenda] = await tx`
      select 1 from agendas a join general_meetings g on g.id = a.meeting_id
      where a.id = ${agendaId} and g.fund_id = ${fundId} and a.agenda_type = 'manager_change' and a.result = 'passed'
    `;
    if (agenda) return agendaId;
  }
  throw new AppError(409, "AGENDA_NOT_PASSED", "결성 이후에는 가결된 운용 인력 교체 안건이 있어야 선임·해임할 수 있습니다", "BR-MGR-04");
}

// 이름·역할만 (구성원 ID·사번은 GP 내부 정보)
const managersUpdated = (tx: typeof sql, fundId: string, data: { action: "appointed" | "replaced" | "ended"; name: string; role: ManagerRole; date: string }) =>
  recordEvent(tx, { event_type: "fund.updated", aggregate_type: "fund", aggregate_id: fundId, lp_id: null, fund_id: fundId, data: { changed: "managers", ...data } });

const invalidDate = (field: string, message: string, rule: string) =>
  new AppError(422, "INVALID_DATE", message, rule, { fields: { [field]: message } });

// ─── 선임·교체·해임 ────────────────────────────────────────────────────────

export async function appointManager(fundId: string, input: AppointManagerInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const agendaId = await lockFundForChange(t, fundId, input.agenda_id);

    // BR-MGR-01: 재직 중인 구성원만
    const [staff] = await tx<{ name: string; hired_date: string; left_date: string | null }[]>`
      select name, hired_date, left_date from staff where id = ${input.staff_id}
    `;
    if (!staff) throw new AppError(422, "VALIDATION_ERROR", "구성원을 찾을 수 없습니다", undefined, { fields: { staff_id: "구성원을 다시 선택하세요" } });
    if (staff.left_date) {
      throw new AppError(422, "STAFF_NOT_ACTIVE", `퇴사한 구성원은 운용 인력으로 지정할 수 없습니다 (${staff.name})`, "BR-MGR-01", {
        fields: { staff_id: "재직 중인 구성원을 선택하세요" },
      });
    }
    if (input.start_date < staff.hired_date) {
      throw invalidDate("start_date", `선임일은 입사일(${staff.hired_date}) 이후여야 합니다`, "BR-MGR-01");
    }

    // 교체: 기존 운용 인력을 새 선임일 자로 해임한다 (BR-MGR-05)
    if (input.replaces_id) {
      const [old] = await tx<{ start_date: string }[]>`
        select start_date from fund_managers
        where id = ${input.replaces_id} and fund_id = ${fundId} and end_date is null
        for update
      `;
      if (!old) throw new AppError(409, "MANAGER_NOT_ACTIVE", "교체할 운용 인력이 현재 담당 중이 아닙니다", "BR-MGR-05");
      if (input.start_date < old.start_date) {
        throw invalidDate("start_date", `교체일은 기존 선임일(${old.start_date}) 이후여야 합니다`, "BR-MGR-05");
      }
      await tx`
        update fund_managers set end_date = ${input.start_date}, ended_by_agenda_id = ${agendaId}
        where id = ${input.replaces_id}
      `;
    }

    // BR-MGR-02: DB 유일 인덱스도 막지만, 누가 맡고 있는지 알려주려고 먼저 확인한다
    const active = await tx<{ staff_id: string; name: string; role: ManagerRole }[]>`
      select m.staff_id, s.name, m.role from fund_managers m join staff s on s.id = m.staff_id
      where m.fund_id = ${fundId} and m.end_date is null
    `;
    const same = active.find((a) => a.staff_id === input.staff_id);
    if (same) {
      throw new AppError(409, "ALREADY_ASSIGNED", `${same.name}님은 이미 이 조합의 ${MANAGER_ROLE_LABEL[same.role]}입니다. 역할을 바꾸려면 교체하세요`, "BR-MGR-02", {
        fields: { staff_id: "이미 담당 중인 구성원입니다" },
      });
    }
    const lead = input.role === "lead" && active.find((a) => a.role === "lead");
    if (lead) {
      throw new AppError(409, "LEAD_EXISTS", `대표펀드매니저는 조합당 1명입니다. 현재 ${lead.name}님을 교체하세요`, "BR-MGR-02", {
        fields: { role: "대표펀드매니저가 이미 있습니다" },
      });
    }

    const [created] = await tx<{ id: string }[]>`
      insert into fund_managers (fund_id, staff_id, role, start_date, appointed_by_agenda_id, created_by)
      values (${fundId}, ${input.staff_id}, ${input.role}, ${input.start_date}, ${agendaId}, ${userId})
      returning id
    `;
    await managersUpdated(t, fundId, { action: input.replaces_id ? "replaced" : "appointed", name: staff.name, role: input.role, date: input.start_date });
    return created;
  });
}

export async function endManager(fundId: string, managerId: string, input: EndManagerInput) {
  assertUuid(managerId, "운용 인력을");
  await sql.begin(async (tx) => {
    const agendaId = await lockFundForChange(tx as unknown as typeof sql, fundId, input.agenda_id);
    const [row] = await tx<{ start_date: string; end_date: string | null; role: ManagerRole; name: string }[]>`
      select m.start_date, m.end_date, m.role, s.name from fund_managers m join staff s on s.id = m.staff_id
      where m.id = ${managerId} and m.fund_id = ${fundId} for update of m
    `;
    if (!row) throw notFound("운용 인력을");
    if (row.end_date) throw new AppError(409, "MANAGER_NOT_ACTIVE", "이미 해임된 운용 인력입니다", "BR-MGR-05");
    if (input.end_date < row.start_date) {
      throw invalidDate("end_date", `해임일은 선임일(${row.start_date}) 이후여야 합니다`, "BR-MGR-05");
    }
    await tx`
      update fund_managers set end_date = ${input.end_date}, ended_by_agenda_id = ${agendaId}
      where id = ${managerId}
    `;
    await managersUpdated(tx as unknown as typeof sql, fundId, { action: "ended", name: row.name, role: row.role, date: input.end_date });
  });
}
