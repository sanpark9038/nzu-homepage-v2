import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = typeof params?.next === "string" && params.next.startsWith("/") ? params.next : "/admin/ops";

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
