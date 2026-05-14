import type { Auth } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuthUserId } from "./authz";
import { workspaceRole } from "./schema/workspaces";

export { workspaceRole };

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type WorkspaceAuthResult = {
  member: Doc<"studioWorkspaceMembers">;
  role: WorkspaceRole;
  userId: string;
  workspace: Doc<"studioWorkspaces">;
};

type WorkspaceAuthCtx = {
  auth: Auth;
  db: QueryCtx["db"] | MutationCtx["db"];
};

const roleRanks: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function normalizeEmail(email: string | null | undefined) {
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

export function roleMeetsMinimum(role: WorkspaceRole, minimum: WorkspaceRole) {
  return roleRanks[role] >= roleRanks[minimum];
}

export function isRoleHigherThan(role: WorkspaceRole, other: WorkspaceRole) {
  return roleRanks[role] > roleRanks[other];
}

export function canActorManageRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole
) {
  if (actorRole === "owner") {
    return true;
  }

  return actorRole === "admin" && targetRole !== "owner";
}

export async function getCurrentWorkspaceUser(ctx: WorkspaceAuthCtx) {
  const [identity, authUserId] = await Promise.all([
    ctx.auth.getUserIdentity(),
    requireAuthUserId(ctx),
  ]);
  const userId = String(authUserId);
  const identityEmail = normalizeEmail(identity?.email);

  if (identityEmail) {
    return { userId, email: identityEmail };
  }

  const user = await getUserById(ctx, userId);

  return {
    userId,
    email: normalizeEmail(user?.email),
  };
}

export async function getUserById(ctx: WorkspaceAuthCtx, userId: string) {
  try {
    return await ctx.db.get(userId as Id<"users">);
  } catch {
    return null;
  }
}

export async function getUserByEmail(
  ctx: WorkspaceAuthCtx,
  email: string | null
) {
  if (!email) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
}

export async function getWorkspaceMembership(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">,
  userId: string
) {
  return await ctx.db
    .query("studioWorkspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .first();
}

export async function requireWorkspaceRole(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">,
  minimumRole: WorkspaceRole
): Promise<WorkspaceAuthResult> {
  const { userId } = await getCurrentWorkspaceUser(ctx);
  const workspace = await ctx.db.get(workspaceId);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const member = await getWorkspaceMembership(ctx, workspaceId, userId);

  if (!member || !roleMeetsMinimum(member.role, minimumRole)) {
    throw new Error("Unauthorized");
  }

  return {
    member,
    role: member.role,
    userId,
    workspace,
  };
}

export async function requireWorkspaceViewer(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">
) {
  return await requireWorkspaceRole(ctx, workspaceId, "viewer");
}

export async function requireWorkspaceEditor(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">
) {
  return await requireWorkspaceRole(ctx, workspaceId, "editor");
}

export async function requireWorkspaceAdmin(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">
) {
  return await requireWorkspaceRole(ctx, workspaceId, "admin");
}

export async function countWorkspaceOwners(
  ctx: WorkspaceAuthCtx,
  workspaceId: Id<"studioWorkspaces">
) {
  return (
    await ctx.db
      .query("studioWorkspaceMembers")
      .withIndex("by_workspaceId_and_role", (q) =>
        q.eq("workspaceId", workspaceId).eq("role", "owner")
      )
      .collect()
  ).length;
}
