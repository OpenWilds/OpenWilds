import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  canActorManageRole,
  countWorkspaceOwners,
  getCurrentWorkspaceUser,
  getUserByEmail,
  getUserById,
  getWorkspaceMembership,
  isRoleHigherThan,
  normalizeEmail,
  requireWorkspaceAdmin,
  requireWorkspaceRole,
  requireWorkspaceViewer,
  roleMeetsMinimum,
  workspaceRole,
  type WorkspaceRole,
} from "./workspaceAuth";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INVITE_EXPIRY_DAYS = 14;

export const requireWorkspaceAccess = internalQuery({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    minimumRole: workspaceRole,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      args.minimumRole
    );

    return {
      role: access.role,
      userId: access.userId,
      workspaceId: access.workspace._id,
    };
  },
});

export const createWorkspace = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentWorkspaceUser(ctx);
    const name = normalizeWorkspaceName(args.name);
    const now = Date.now();
    const slug = await createUniqueWorkspaceSlug(ctx, name);
    const workspaceId = await ctx.db.insert("studioWorkspaces", {
      name,
      slug,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("studioWorkspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    return {
      _id: workspaceId,
      name,
      slug,
      role: "owner" as const,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  },
});

export const listMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await getCurrentWorkspaceUser(ctx);
    const memberships = await ctx.db
      .query("studioWorkspaceMembers")
      .withIndex("by_userId_and_workspaceId", (q) => q.eq("userId", userId))
      .collect();
    const records = await Promise.all(
      memberships.map(async (member) => {
        const workspace = await ctx.db.get(member.workspaceId);

        if (!workspace) {
          return null;
        }

        return {
          ...workspace,
          role: member.role,
          membershipId: member._id,
        };
      })
    );

    return records
      .flatMap((record) => (record ? [record] : []))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getWorkspace = query({
  args: {
    workspaceId: v.id("studioWorkspaces"),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceViewer(ctx, args.workspaceId);

    return {
      ...access.workspace,
      role: access.role,
    };
  },
});

export const getMyRole = query({
  args: {
    workspaceId: v.id("studioWorkspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceRole | null> => {
    const { userId } = await getCurrentWorkspaceUser(ctx);
    const member = await getWorkspaceMembership(ctx, args.workspaceId, userId);

    return member?.role ?? null;
  },
});

export const listMembers = query({
  args: {
    workspaceId: v.id("studioWorkspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceViewer(ctx, args.workspaceId);

    const members = await ctx.db
      .query("studioWorkspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect();

    return await Promise.all(
      members.map(async (member) => {
        const user = await getUserById(ctx, member.userId);

        return {
          ...member,
          user: {
            _id: member.userId,
            email: user?.email ?? null,
            name: user?.name ?? null,
          },
        };
      })
    );
  },
});

export const createInvite = mutation({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    email: v.string(),
    role: workspaceRole,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAdmin(ctx, args.workspaceId);

    if (!canActorManageRole(access.role, args.role)) {
      throw new Error("Unauthorized");
    }

    const email = normalizeEmail(args.email);

    if (!email) {
      throw new Error("Enter a valid email address.");
    }

    const existingMemberUser = await getUserByEmail(ctx, email);
    const existingMembership = existingMemberUser
      ? await getWorkspaceMembership(
          ctx,
          args.workspaceId,
          String(existingMemberUser._id)
        )
      : null;

    if (existingMembership) {
      throw new Error("User is already a workspace member.");
    }

    const now = Date.now();
    const existingInvite = await ctx.db
      .query("studioWorkspaceInvites")
      .withIndex("by_workspaceId_and_email_and_status", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("email", email)
          .eq("status", "pending")
      )
      .first();
    const patch = {
      role: args.role,
      token: createInviteToken(),
      invitedBy: access.userId,
      expiresAt: now + DEFAULT_INVITE_EXPIRY_DAYS * DAY_MS,
      updatedAt: now,
    };

    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, patch);

      return {
        ...existingInvite,
        ...patch,
      };
    }

    const inviteId = await ctx.db.insert("studioWorkspaceInvites", {
      workspaceId: args.workspaceId,
      email,
      status: "pending",
      createdAt: now,
      ...patch,
    });

    return await ctx.db.get(inviteId);
  },
});

export const listWorkspaceInvites = query({
  args: {
    workspaceId: v.id("studioWorkspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdmin(ctx, args.workspaceId);

    return await ctx.db
      .query("studioWorkspaceInvites")
      .withIndex("by_workspaceId_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect();
  },
});

export const listMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const { email } = await getCurrentWorkspaceUser(ctx);

    if (!email) {
      return [];
    }

    const now = Date.now();
    const invites = await ctx.db
      .query("studioWorkspaceInvites")
      .withIndex("by_email_and_status", (q) =>
        q.eq("email", email).eq("status", "pending")
      )
      .collect();

    return await Promise.all(
      invites
        .filter((invite) => invite.expiresAt > now)
        .map(async (invite) => {
          const workspace = await ctx.db.get(invite.workspaceId);

          return {
            ...invite,
            workspace,
          };
        })
    );
  },
});

export const acceptInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { email, userId } = await getCurrentWorkspaceUser(ctx);
    const invite = await getPendingInviteByToken(ctx, args.token);

    if (!email || invite.email !== email) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const existingMembership = await getWorkspaceMembership(
      ctx,
      invite.workspaceId,
      userId
    );

    if (existingMembership) {
      if (
        existingMembership.role !== "owner" &&
        isRoleHigherThan(invite.role, existingMembership.role)
      ) {
        await ctx.db.patch(existingMembership._id, {
          role: invite.role,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("studioWorkspaceMembers", {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedBy: userId,
      acceptedAt: now,
      updatedAt: now,
    });

    const workspace = await ctx.db.get(invite.workspaceId);
    const member = await getWorkspaceMembership(
      ctx,
      invite.workspaceId,
      userId
    );

    return {
      workspace,
      role: member?.role ?? invite.role,
    };
  },
});

export const declineInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await getCurrentWorkspaceUser(ctx);
    const invite = await getPendingInviteByToken(ctx, args.token);

    if (!email || invite.email !== email) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    await ctx.db.patch(invite._id, {
      status: "declined",
      declinedAt: now,
      updatedAt: now,
    });

    return invite._id;
  },
});

export const revokeInvite = mutation({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    inviteId: v.id("studioWorkspaceInvites"),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAdmin(ctx, args.workspaceId);
    const invite = await ctx.db.get(args.inviteId);

    if (!invite || invite.workspaceId !== args.workspaceId) {
      throw new Error("Invite not found");
    }

    if (!canActorManageRole(access.role, invite.role)) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    await ctx.db.patch(invite._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });

    return invite._id;
  },
});

export const updateMemberRole = mutation({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    userId: v.string(),
    role: workspaceRole,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAdmin(ctx, args.workspaceId);
    const target = await getWorkspaceMembership(
      ctx,
      args.workspaceId,
      args.userId
    );

    if (!target) {
      throw new Error("Workspace member not found");
    }

    if (
      !canActorManageRole(access.role, target.role) ||
      !canActorManageRole(access.role, args.role)
    ) {
      throw new Error("Unauthorized");
    }

    if (target.role === "owner" && args.role !== "owner") {
      await requireAnotherOwner(ctx, args.workspaceId);
    }

    await ctx.db.patch(target._id, {
      role: args.role,
      updatedAt: Date.now(),
    });

    return target._id;
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAdmin(ctx, args.workspaceId);
    const target = await getWorkspaceMembership(
      ctx,
      args.workspaceId,
      args.userId
    );

    if (!target) {
      throw new Error("Workspace member not found");
    }

    if (!canActorManageRole(access.role, target.role)) {
      throw new Error("Unauthorized");
    }

    if (target.role === "owner") {
      await requireAnotherOwner(ctx, args.workspaceId);
    }

    await ctx.db.delete(target._id);

    return target._id;
  },
});

async function getPendingInviteByToken(
  ctx: Parameters<typeof getCurrentWorkspaceUser>[0],
  token: string
) {
  const invite = await ctx.db
    .query("studioWorkspaceInvites")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (!invite || invite.status !== "pending") {
    throw new Error("Invite not found");
  }

  if (invite.expiresAt <= Date.now()) {
    throw new Error("Invite has expired");
  }

  return invite;
}

async function requireAnotherOwner(
  ctx: Parameters<typeof getCurrentWorkspaceUser>[0],
  workspaceId: Id<"studioWorkspaces">
) {
  const ownerCount = await countWorkspaceOwners(ctx, workspaceId);

  if (ownerCount <= 1) {
    throw new Error("A workspace must have at least one owner.");
  }
}

async function createUniqueWorkspaceSlug(
  ctx: Parameters<typeof getCurrentWorkspaceUser>[0],
  name: string
) {
  const baseSlug = slugify(name);
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await ctx.db
      .query("studioWorkspaces")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first()
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function normalizeWorkspaceName(name: string) {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error("Workspace name is required.");
  }

  return normalized;
}

function slugify(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

function createInviteToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}
