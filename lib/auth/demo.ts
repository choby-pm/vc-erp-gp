// 면접관이 클릭 한 번으로 둘러볼 수 있는 데모 계정 (scripts/seed-demo.mjs 가 생성)
export const DEMO_USER_EMAIL = "demo@vc-erp.dev";

// 배포된 사이트(Vercel)에서 데모 전용 DB(매일 초기화, D44)를 쓰지 않으면, 누구나 누르는 데모 버튼이 실제 데이터를 바꾸지 않도록
// 조회 전용 세션으로 들어간다 (D43). 데모 DB를 쓰면 관리자로 마음껏 써 볼 수 있다. 로컬 개발은 관리자 그대로
export const demoIsReadOnly = () => Boolean(process.env.VERCEL_ENV) && !process.env.APP_DATABASE_URL;
