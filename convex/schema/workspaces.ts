import { defineTable } from "convex/server";
import { v } from "convex/values";

export const workspaceRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("viewer")
);

export const workspaceInviteStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("revoked")
);

export const workspaceTables = {
  studioWorkspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_createdBy_and_updatedAt", ["createdBy", "updatedAt"]),

  studioWorkspaceMembers: defineTable({
    workspaceId: v.id("studioWorkspaces"),
    userId: v.string(),
    role: workspaceRole,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"])
    .index("by_userId_and_workspaceId", ["userId", "workspaceId"])
    .index("by_workspaceId_and_role", ["workspaceId", "role"]),

  studioWorkspaceInvites: defineTable({
    workspaceId: v.id("studioWorkspaces"),
    email: v.string(),
    role: workspaceRole,
    token: v.string(),
    status: workspaceInviteStatus,
    invitedBy: v.string(),
    acceptedBy: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_email_and_status", ["email", "status"])
    .index("by_workspaceId_and_status", ["workspaceId", "status"])
    .index("by_workspaceId_and_email_and_status", [
      "workspaceId",
      "email",
      "status",
    ]),
};
