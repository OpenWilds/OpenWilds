import { getAuthUserId } from "@convex-dev/auth/server";
import type { Auth } from "convex/server";

export async function requireAuthUserId(ctx: { auth: Auth }) {
  const userId = await getAuthUserId(ctx);

  if (userId === null) {
    throw new Error("Not authenticated");
  }

  return userId;
}

export async function requireAuthUserKey(ctx: { auth: Auth }) {
  return String(await requireAuthUserId(ctx));
}
