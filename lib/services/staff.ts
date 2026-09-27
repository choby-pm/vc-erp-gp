import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import type { FundStatus, ManagerRole } from "@/lib/labels";
import type { StaffInput } from "@/lib/schemas/staff";

// 구성원 서비스 (D31)
// · 구성원 = 운용사에 소속된 사람. 조합 운용 인력은 구성원 중에서 지정한다
// · 로그인 계정(users)과 1:1로 연결할 수 있고, 퇴사하면 계정이 자동으로 중지된다

export type StaffListItem = {
  id: string;
  employee_no: string;
  name: string;
  position: string;
  department: string | null;
  hired_date: string;
  left_date: string | null;
  has_account: boolean;
  account_disabled: boolean;
  active_fund_count: number; // 현재 운용 인력으로 담당 중인 조합 수
};

export type StaffDetail = Omit<StaffListItem, "has_account" | "account_disabled" | "active_fund_count"> & {
  email: string | null;
  phone: string | null;
  account: { user_id: string; login_email: string; disabled_at: Date | null } | null;
  assignments: {
    fund_id: string;
    fund_name: string;
    fund_status: FundStatus;
    role: ManagerRole;
    start_date: string;
    end_date: string | null;
  }[];
};

export async function listStaff(status: "active" | "left" | "all" = "active") {
  return sql<StaffListItem[]>`
    select s.id, s.employee_no, s.name, s.position, s.department, s.hired_date, s.left_date,
           s.user_id is not null                           as has_account,
           coalesce(u.disabled_at is not null, false)      as account_disabled,
           (select count(*)::int from fund_managers m where m.staff_id = s.id and m.end_date is null)
                                                           as active_fund_count
    from staff s
    left join users u on u.id = s.user_id
    where ${status} = 'all'
       or (${status} = 'active' and s.left_date is null)
       or (${status} = 'left' and s.left_date is not null)
    order by s.left_date is not null, s.employee_no
  `;
}

export async function getStaff(staffId: string): Promise<StaffDetail> {
  assertUuid(staffId, "구성원을");
  const [row] = await sql`
    select s.id, s.employee_no, s.name, s.position, s.department, s.email, s.phone, s.hired_date, s.left_date,
           u.id as user_id, u.email as login_email, u.disabled_at
    from staff s
    left join users u on u.id = s.user_id
    where s.id = ${staffId}
  `;
  if (!row) throw notFound("구성원을");

  const assignments = await sql<StaffDetail["assignments"]>`
    select f.id as fund_id, f.name as fund_name, f.status as fund_status, m.role, m.start_date, m.end_date
    from fund_managers m
    join funds f on f.id = m.fund_id
    where m.staff_id = ${staffId}
    order by m.end_date is not null, m.start_date desc
  `;

  const { user_id, login_email, disabled_at, ...staff } = row;
  return {
    ...(staff as StaffDetail),
    account: user_id ? { user_id, login_email, disabled_at } : null,
    assignments,
  };
}

// ─── 등록·수정 ─────────────────────────────────────────────────────────────

async function assertEmployeeNoUnique(tx: typeof sql, employeeNo: string, exceptId?: string) {
  const [dup] = await tx<{ name: string }[]>`
    select name from staff where employee_no = ${employeeNo}
      and id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
  `;
  if (dup) {
    throw new AppError(409, "DUPLICATE_EMPLOYEE_NO", `이미 사용 중인 사번입니다 (${dup.name})`, "BR-STF-01", {
      fields: { employee_no: `이미 사용 중인 사번입니다: ${dup.name}` },
    });
  }
}

// 로그인 계정을 만들고 임시 비밀번호를 돌려준다. 비밀번호는 이 응답에서 한 번만 보인다 (BR-STF-03)
async function createAccountFor(tx: typeof sql, staff: { id: string; name: string; email: string | null }) {
  if (!staff.email) {
    throw new AppError(422, "EMAIL_REQUIRED", "로그인 계정을 만들려면 업무 이메일이 필요합니다", "BR-STF-03", {
      fields: { email: "로그인 계정을 만들려면 이메일을 입력하세요" },
    });
  }
  const [taken] = await tx`select 1 from users where email = ${staff.email}`;
  if (taken) {
    throw new AppError(409, "DUPLICATE_LOGIN_EMAIL", "이미 로그인 계정에 사용 중인 이메일입니다", "BR-STF-03", {
      fields: { email: "이미 로그인 계정에 사용 중인 이메일입니다" },
    });
  }
  const tempPassword = generateTempPassword();
  const [user] = await tx<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${staff.email}, ${staff.name}, ${await hashPassword(tempPassword)})
    returning id
  `;
  await tx`update staff set user_id = ${user.id} where id = ${staff.id}`;
  return { login_email: staff.email, temp_password: tempPassword };
}

export async function createStaff(input: StaffInput, createAccount: boolean, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await assertEmployeeNoUnique(t, input.employee_no);
    const [created] = await tx<{ id: string }[]>`
      insert into staff ${tx({ ...input, created_by: userId })}
      returning id
    `;
    const account = createAccount ? await createAccountFor(t, { id: created.id, name: input.name, email: input.email }) : null;
    return { id: created.id, account };
  });
}

// 계정이 연결된 구성원은 이름을 바꾸면 로그인 계정의 표시 이름도 함께 바꾼다
export async function updateStaff(staffId: string, input: StaffInput) {
  assertUuid(staffId, "구성원을");
  await sql.begin(async (tx) => {
    await assertEmployeeNoUnique(tx as unknown as typeof sql, input.employee_no, staffId);
    const [updated] = await tx<{ user_id: string | null }[]>`
      update staff set ${tx(input)}
      where id = ${staffId}
      returning user_id
    `;
    if (!updated) throw notFound("구성원을");
    if (updated.user_id) await tx`update users set name = ${input.name} where id = ${updated.user_id}`;
  });
}

// ─── 퇴사·계정 관리 ────────────────────────────────────────────────────────

async function lockStaff(tx: typeof sql, staffId: string) {
  assertUuid(staffId, "구성원을");
  const [row] = await tx<{ id: string; name: string; email: string | null; user_id: string | null; left_date: string | null; hired_date: string }[]>`
    select id, name, email, user_id, left_date, hired_date from staff where id = ${staffId} for update
  `;
  if (!row) throw notFound("구성원을");
  return row;
}

function assertNotSelf(userId: string | null, currentUserId: string) {
  if (userId === currentUserId) {
    throw new AppError(409, "CANNOT_DISABLE_SELF", "자기 자신의 계정은 중지하거나 퇴사 처리할 수 없습니다", "BR-STF-05");
  }
}

async function disableAccount(tx: typeof sql, userId: string) {
  await tx`update users set disabled_at = now() where id = ${userId} and disabled_at is null`;
  await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
}

// 퇴사 처리: 담당 조합이 남아 있으면 먼저 운용 인력을 교체해야 한다 (BR-STF-02)
export async function leaveStaff(staffId: string, leftDate: string, currentUserId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const staff = await lockStaff(t, staffId);
    assertNotSelf(staff.user_id, currentUserId);
    if (staff.left_date) throw new AppError(409, "ALREADY_LEFT", "이미 퇴사 처리된 구성원입니다", "BR-STF-02");
    if (leftDate < staff.hired_date) {
      throw new AppError(422, "INVALID_DATE", "퇴사일은 입사일 이후여야 합니다", "BR-STF-02", { fields: { left_date: "입사일 이후 날짜를 입력하세요" } });
    }

    const active = await tx<{ fund_name: string }[]>`
      select f.name as fund_name from fund_managers m join funds f on f.id = m.fund_id
      where m.staff_id = ${staffId} and m.end_date is null
    `;
    if (active.length > 0) {
      throw new AppError(409, "STAFF_HAS_ACTIVE_FUNDS", `담당 중인 조합이 있어 퇴사 처리할 수 없습니다: ${active.map((a) => a.fund_name).join(", ")}`, "BR-STF-02", {
        funds: active.map((a) => a.fund_name),
      });
    }

    await tx`update staff set left_date = ${leftDate} where id = ${staffId}`;
    if (staff.user_id) await disableAccount(t, staff.user_id);
  });
}

export async function createAccount(staffId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const staff = await lockStaff(t, staffId);
    if (staff.user_id) throw new AppError(409, "ACCOUNT_EXISTS", "이미 로그인 계정이 있습니다", "BR-STF-03");
    if (staff.left_date) throw new AppError(409, "ALREADY_LEFT", "퇴사한 구성원에게는 계정을 만들 수 없습니다", "BR-STF-03");
    return createAccountFor(t, staff);
  });
}

export async function resetPassword(staffId: string) {
  return sql.begin(async (tx) => {
    const staff = await lockStaff(tx as unknown as typeof sql, staffId);
    if (!staff.user_id) throw new AppError(409, "NO_ACCOUNT", "로그인 계정이 없습니다", "BR-STF-03");
    const tempPassword = generateTempPassword();
    const [user] = await tx<{ email: string }[]>`
      update users set password_hash = ${await hashPassword(tempPassword)} where id = ${staff.user_id} returning email
    `;
    // 비밀번호가 바뀌면 기존 로그인은 모두 끊는다
    await tx`update sessions set revoked_at = now() where user_id = ${staff.user_id} and revoked_at is null`;
    return { login_email: user.email, temp_password: tempPassword };
  });
}

export async function setAccountEnabled(staffId: string, enabled: boolean, currentUserId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const staff = await lockStaff(t, staffId);
    if (!staff.user_id) throw new AppError(409, "NO_ACCOUNT", "로그인 계정이 없습니다", "BR-STF-03");
    if (enabled) {
      if (staff.left_date) throw new AppError(409, "ALREADY_LEFT", "퇴사한 구성원의 계정은 다시 사용할 수 없습니다", "BR-STF-04");
      await tx`update users set disabled_at = null where id = ${staff.user_id}`;
    } else {
      assertNotSelf(staff.user_id, currentUserId);
      await disableAccount(t, staff.user_id);
    }
  });
}
