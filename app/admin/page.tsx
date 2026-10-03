export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/supabase/server";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminPage() {
  const user = await requireAdminPage();

  return <AdminDashboard adminEmail={user.email || ""} />;
}
