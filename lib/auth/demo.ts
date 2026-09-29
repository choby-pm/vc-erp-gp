// 면접관이 클릭 한 번으로 둘러볼 수 있는 데모 계정 (scripts/seed-demo.mjs 가 생성)
export const DEMO_USER_EMAIL = "demo@vc-erp.dev";

// 배포된 사이트(Vercel)에서는 누구나 데모 버튼을 누를 수 있으므로 조회 전용 세션으로 들어간다 (D43).
// 로컬 개발(VERCEL_ENV 없음)에서는 데모 계정 역할(관리자) 그대로
export const demoIsReadOnly = () => Boolean(process.env.VERCEL_ENV);
