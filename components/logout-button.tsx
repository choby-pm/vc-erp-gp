"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
    >
      로그아웃
    </button>
  );
}
