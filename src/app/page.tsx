import { redirect } from "next/navigation";
import { getUser, isAdmin } from "@/lib/auth";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  redirect(isAdmin(user.email) ? "/admin" : "/catalog");
}
