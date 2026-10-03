export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/supabase/server";
import AdminQRGenerator from "@/components/AdminQRGenerator";

export default async function QRPage() {
  await requireAdminPage();
  return <AdminQRGenerator />;
}
