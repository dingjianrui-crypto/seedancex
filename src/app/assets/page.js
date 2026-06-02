import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { AssetsPageClient } from "@/components/saas/AssetsPageClient";
import { authOptions } from "@/lib/auth";
import { assertPremiumAssetsAccess } from "@/lib/server/premium-assets";

export default async function AssetsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/pricing");
  }

  try {
    await assertPremiumAssetsAccess(session.user.id);
  } catch {
    redirect("/pricing");
  }

  return <AssetsPageClient />;
}
