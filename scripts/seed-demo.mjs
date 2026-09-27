// 데모 계정 생성 스크립트
//
// 면접관용 데모 계정(demo@vc-erp.dev)을 만든다. 이미 있으면 비밀번호만 새로 바꾼다.
// 비밀번호는 실행할 때마다 무작위로 만들어 화면에 한 번만 보여준다.
// (데모 버튼은 비밀번호 없이 로그인하므로, 이 비밀번호는 일반 로그인 기능을 시험할 때만 쓴다)
//
// 사용법: npm run db:seed

import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';

const DEMO_EMAIL = 'demo@vc-erp.dev';
const DEMO_NAME = '데모 심사역';

// lib/auth/password.ts 와 같은 형식: scrypt$<salt>$<hash>
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await promisify(scrypt)(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

const sql = postgres(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, { max: 1 });

try {
  const password = randomBytes(9).toString('base64url');
  const [user] = await sql`
    insert into users (email, name, password_hash)
    values (${DEMO_EMAIL}, ${DEMO_NAME}, ${await hashPassword(password)})
    on conflict (email) do update set password_hash = excluded.password_hash
    returning (xmax = 0) as created
  `;
  console.log(user.created ? '✔ 데모 계정을 만들었습니다' : '✔ 데모 계정 비밀번호를 새로 바꿨습니다');
  console.log(`  이메일:   ${DEMO_EMAIL}`);
  console.log(`  비밀번호: ${password}`);
} catch (err) {
  console.error('✖ 데모 계정 생성 실패:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
