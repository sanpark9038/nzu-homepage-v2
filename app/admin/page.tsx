import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminEntryPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (isValidAdminSession(sessionValue)) {
    redirect("/admin/ops");
  }

  redirect("/admin/login?next=/admin/ops");
}
