import { redirect } from "next/navigation";

// 홈은 R7에서 전체 대시보드가 된다. 그 전까지는 조합 목록으로 보낸다
export default function HomePage() {
  redirect("/funds");
}
