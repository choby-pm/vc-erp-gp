import { del, list } from "@vercel/blob";

// 데모 DB 매일 초기화 (D44)
// · 배포된 사이트는 Neon 의 demo 브랜치를 쓴다 (APP_DATABASE_URL). 로컬 개발은 main 브랜치
// · demo-seed 브랜치(컴퓨트 없는 고정 스냅샷)로 demo 를 되돌린다 → 면접관이 관리자로 마음껏 써 봐도 다음 날 원래 데모 데이터
// · 배포 사이트에서 올린 파일은 BLOB_PATH_PREFIX(예: demo/) 아래에 있으므로 그 경로만 지운다 (로컬 개발 파일은 건드리지 않는다)

const NEON_API = "https://console.neon.tech/api/v2";

export function demoResetConfig() {
  const { NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID } = process.env;
  if (!NEON_API_KEY || !NEON_PROJECT_ID || !DEMO_BRANCH_ID || !DEMO_SEED_BRANCH_ID) return null;
  return { apiKey: NEON_API_KEY, projectId: NEON_PROJECT_ID, demoBranchId: DEMO_BRANCH_ID, seedBranchId: DEMO_SEED_BRANCH_ID };
}

// Neon 브랜치 복원: target 을 source 의 최신 상태로 되돌린다
export async function restoreBranch(apiKey: string, projectId: string, targetBranchId: string, sourceBranchId: string) {
  const res = await fetch(`${NEON_API}/projects/${projectId}/branches/${targetBranchId}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source_branch_id: sourceBranchId }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(`Neon 브랜치 복원 실패 (HTTP ${res.status}): ${json.message ?? ""}`.trim());
}

async function deleteDemoFiles() {
  const prefix = process.env.BLOB_PATH_PREFIX;
  // 접두어가 없으면 로컬 개발 파일까지 지울 수 있으므로 아무것도 지우지 않는다
  if (!prefix || prefix === "/" || !(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)) return 0;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.pathname));
    deleted += page.blobs.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function resetDemo() {
  const config = demoResetConfig();
  if (!config) return { configured: false as const };
  await restoreBranch(config.apiKey, config.projectId, config.demoBranchId, config.seedBranchId);
  const files_deleted = await deleteDemoFiles();
  return { configured: true as const, restored_from: "demo-seed", files_deleted };
}
