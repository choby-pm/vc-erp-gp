// 데모 구성원 5명 + 로그인 계정 생성
//
// · 사번 기준으로 이미 있으면 정보를 갱신하고, 없으면 새로 만든다 (여러 번 실행해도 안전)
// · 로그인 계정 비밀번호는 실행할 때마다 새로 만들고, demo-accounts.md 파일에 적는다
//   (이 파일은 .gitignore 에 포함되어 GitHub에 올라가지 않는다)
// · 박서연 수석심사역은 기존 데모 계정(demo@vc-erp.dev)과 연결된다. 로그인 화면의 데모 버튼이 이 계정이다
//
// 사용법: npm run db:seed-staff

import { randomBytes, scrypt } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import postgres from 'postgres';

// 권한 (D42, lib/auth/permissions.ts 와 같은 이름)
const ROLE_LABEL = { admin: '관리자', manager: '운용', finance: '재무', viewer: '조회' };

const STAFF = [
  { employee_no: 'GP-2015-001', name: '김도윤', position: '대표이사', department: '경영진', email: 'doyun.kim@vc-erp.dev', phone: '010-1000-0001', hired_date: '2015-03-02', role: 'admin' },
  { employee_no: 'GP-2017-002', name: '이서준', position: '파트너', department: '투자본부', email: 'seojun.lee@vc-erp.dev', phone: '010-1000-0002', hired_date: '2017-07-03', role: 'manager' },
  { employee_no: 'GP-2019-004', name: '박서연', position: '수석심사역', department: '투자본부', email: 'demo@vc-erp.dev', phone: '010-1000-0004', hired_date: '2019-01-07', role: 'admin' }, // 데모 버튼: 모든 화면을 둘러볼 수 있게
  { employee_no: 'GP-2020-005', name: '정하은', position: '관리팀장', department: '경영지원팀', email: 'haeun.jung@vc-erp.dev', phone: '010-1000-0005', hired_date: '2020-04-01', role: 'finance' },
  { employee_no: 'GP-2021-007', name: '최민재', position: '심사역', department: '투자본부', email: 'minjae.choi@vc-erp.dev', phone: '010-1000-0007', hired_date: '2021-09-01', role: 'manager' },
];

// lib/auth/password.ts 와 같은 형식
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await promisify(scrypt)(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
}

const sql = postgres(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, { max: 1 });
const accounts = [];

try {
  await sql.begin(async (tx) => {
    for (const s of STAFF) {
      const password = tempPassword();
      const [user] = await tx`
        insert into users (email, name, password_hash, role)
        values (${s.email}, ${s.name}, ${await hashPassword(password)}, ${s.role})
        on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, disabled_at = null, role = excluded.role
        returning id
      `;
      await tx`
        insert into staff (employee_no, name, position, department, email, phone, hired_date, user_id)
        values (${s.employee_no}, ${s.name}, ${s.position}, ${s.department}, ${s.email}, ${s.phone}, ${s.hired_date}, ${user.id})
        on conflict (employee_no) do update set
          name = excluded.name, position = excluded.position, department = excluded.department,
          email = excluded.email, phone = excluded.phone, hired_date = excluded.hired_date,
          left_date = null, user_id = excluded.user_id
      `;
      accounts.push({ ...s, password });
    }
  });

  const rows = accounts
    .map((a) => `| ${a.employee_no} | ${a.name} | ${a.position} | ${ROLE_LABEL[a.role]} | \`${a.email}\` | \`${a.password}\` |${a.email === 'demo@vc-erp.dev' ? ' 데모 버튼 계정 |' : ' |'}`)
    .join('\n');
  await writeFile(
    'demo-accounts.md',
    `# 데모 구성원 로그인 계정

> ⚠️ 이 파일은 비밀번호가 들어 있어 git에 올라가지 않습니다 (.gitignore).
> \`npm run db:seed-staff\` 를 다시 실행하면 비밀번호가 새로 바뀌고 이 파일도 갱신됩니다.
> 생성: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

- 접속 주소 (로컬): http://localhost:3100
- 로그인 화면의 **데모 계정으로 둘러보기** 버튼 = 박서연 수석심사역 계정

| 사번 | 이름 | 직위 | 권한 | 로그인 ID | 비밀번호 | 비고 |
|---|---|---|---|---|---|---|
${rows}
`,
  );
  console.log(`✔ 구성원 ${accounts.length}명과 로그인 계정을 만들었습니다`);
  console.log('  계정 정보: demo-accounts.md');
} catch (err) {
  console.error('✖ 구성원 생성 실패:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
