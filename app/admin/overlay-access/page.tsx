import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { OverlayAccessAdmin } from "./OverlayAccessAdmin";
import LogoutButton from "../ops/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "HOSAGA Admin - 오버레이 사용 신청",
};

export default async function AdminOverlayAccessPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/overlay-access");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-black">오버레이 사용 신청</h1>
        <LogoutButton />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        방송 스코어보드(/overlay/admin) 사용 신청을 승인·관리합니다.
      </p>
      <AdminNav />
      <OverlayAccessAdmin />
    </main>
  );
}
