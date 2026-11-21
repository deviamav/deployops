import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/sidebar-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  return (
    <SidebarProvider>
      <div className="app-canvas flex min-h-screen">
        <AppSidebar role={user.role} email={user.email} name={user.name} />
        <main className="page-main min-h-screen min-w-0 flex-1 overflow-x-hidden px-4 py-5 pb-24 md:px-8 md:py-7 lg:pb-8">
          <div className="page-enter mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
