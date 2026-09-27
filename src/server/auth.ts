import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config/env";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, getConfig().sessionSecret ?? null);
}

/** Call at the top of every server action and admin page. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}
