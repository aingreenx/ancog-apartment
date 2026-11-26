import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/login-id";

async function GoHome(): Promise<null> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.mustChangePassword ? "/change-password" : homeFor(user.role));
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GoHome />
    </Suspense>
  );
}
