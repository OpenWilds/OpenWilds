import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./authz";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailPassword = Password({
  profile(params) {
    const email = String(params.email ?? "")
      .trim()
      .toLowerCase();

    if (!emailPattern.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }

    return { email };
  },
  validatePasswordRequirements(password: string) {
    if (password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [EmailPassword],
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error("Authenticated user does not exist.");
    }

    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});
