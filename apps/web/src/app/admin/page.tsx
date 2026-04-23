import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./AdminDashboard";
import { isValidAdminSessionToken } from "@/lib/admin-session";

export const metadata = { title: "Admin Dashboard — Serendip.bot" };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminSession = cookieStore.get("admin_session")?.value;
  const secret = process.env.ADMIN_SECRET_KEY;

  if (!secret || !isValidAdminSessionToken(adminSession, secret)) {
    redirect("/admin/login");
  }

  return <AdminDashboard />;
}
