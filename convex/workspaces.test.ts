// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const testBackend = () => convexTest(schema, modules);

const asUser = (
  t: ReturnType<typeof testBackend>,
  user: string,
  email = `${user}@example.com`
) =>
  t.withIdentity({
    subject: `${user}|test-session`,
    tokenIdentifier: `https://convex.test|${user}`,
    email,
  });

describe("Studio workspaces", () => {
  it("creates workspaces and lists memberships for the owner", async () => {
    const t = asUser(testBackend(), "owner");

    const workspace = await t.mutation(api.workspaces.createWorkspace, {
      name: "Garden Team",
    });
    const workspaces = await t.query(api.workspaces.listMyWorkspaces, {});
    const members = await t.query(api.workspaces.listMembers, {
      workspaceId: workspace._id,
    });

    expect(workspace.role).toBe("owner");
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
      _id: workspace._id,
      name: "Garden Team",
      role: "owner",
    });
    expect(members[0]).toMatchObject({
      userId: "owner",
      role: "owner",
    });
    await expect(
      t.mutation(api.workspaces.updateMemberRole, {
        workspaceId: workspace._id,
        userId: "owner",
        role: "viewer",
      })
    ).rejects.toThrow("at least one owner");
    await expect(
      t.mutation(api.workspaces.removeMember, {
        workspaceId: workspace._id,
        userId: "owner",
      })
    ).rejects.toThrow("at least one owner");
  });

  it("accepts and declines email-bound invites", async () => {
    const backend = testBackend();
    const owner = asUser(backend, "owner");
    const workspace = await owner.mutation(api.workspaces.createWorkspace, {
      name: "Invite Lab",
    });
    const invite = await owner.mutation(api.workspaces.createInvite, {
      workspaceId: workspace._id,
      email: "editor@example.com",
      role: "editor",
    });
    const editor = asUser(backend, "editor", "editor@example.com");
    const pending = await editor.query(api.workspaces.listMyInvites, {});

    expect(pending).toHaveLength(1);
    await editor.mutation(api.workspaces.acceptInvite, {
      token: invite!.token,
    });
    const editorWorkspaces = await editor.query(
      api.workspaces.listMyWorkspaces,
      {}
    );

    expect(editorWorkspaces[0]).toMatchObject({
      _id: workspace._id,
      role: "editor",
    });

    const viewerInvite = await owner.mutation(api.workspaces.createInvite, {
      workspaceId: workspace._id,
      email: "viewer@example.com",
      role: "viewer",
    });
    const viewer = asUser(backend, "viewer", "viewer@example.com");

    await viewer.mutation(api.workspaces.declineInvite, {
      token: viewerInvite!.token,
    });
    expect(await viewer.query(api.workspaces.listMyInvites, {})).toHaveLength(
      0
    );
  });

  it("enforces editor and viewer permissions for workspace assets", async () => {
    const backend = testBackend();
    const owner = asUser(backend, "owner");
    const workspace = await owner.mutation(api.workspaces.createWorkspace, {
      name: "Permission Lab",
    });
    const editorInvite = await owner.mutation(api.workspaces.createInvite, {
      workspaceId: workspace._id,
      email: "editor@example.com",
      role: "editor",
    });
    const viewerInvite = await owner.mutation(api.workspaces.createInvite, {
      workspaceId: workspace._id,
      email: "viewer@example.com",
      role: "viewer",
    });
    const editor = asUser(backend, "editor", "editor@example.com");
    const viewer = asUser(backend, "viewer", "viewer@example.com");

    await editor.mutation(api.workspaces.acceptInvite, {
      token: editorInvite!.token,
    });
    await viewer.mutation(api.workspaces.acceptInvite, {
      token: viewerInvite!.token,
    });

    const mapId = await editor.mutation(api.studio.saveMap, {
      workspaceId: workspace._id,
      name: "Editor World",
      width: 4,
      height: 4,
      mapJson: "{}",
    });

    expect(mapId).toBeTruthy();
    await expect(
      viewer.mutation(api.studio.saveMap, {
        workspaceId: workspace._id,
        name: "Viewer World",
        width: 4,
        height: 4,
        mapJson: "{}",
      })
    ).rejects.toThrow("Unauthorized");
    expect(
      await viewer.query(api.studio.listMaps, {
        workspaceId: workspace._id,
      })
    ).toHaveLength(1);
  });

  it("keeps duplicate asset identifiers isolated by workspace", async () => {
    const t = asUser(testBackend(), "owner");
    const first = await t.mutation(api.workspaces.createWorkspace, {
      name: "First Team",
    });
    const second = await t.mutation(api.workspaces.createWorkspace, {
      name: "Second Team",
    });
    const firstStorageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["first"], { type: "image/png" }))
    );
    const secondStorageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["second"], { type: "image/png" }))
    );

    await t.mutation(api.studio.registerSourceTexture, {
      workspaceId: first._id,
      terrainId: "shared-terrain",
      label: "First Shared",
      storageId: firstStorageId,
      fileName: "first.png",
      contentType: "image/png",
      size: 5,
      material: "grass",
      texturePrompt: "green grass",
      stylePrompt: "painted",
      status: "approved",
    });
    await t.mutation(api.studio.registerSourceTexture, {
      workspaceId: second._id,
      terrainId: "shared-terrain",
      label: "Second Shared",
      storageId: secondStorageId,
      fileName: "second.png",
      contentType: "image/png",
      size: 6,
      material: "stone",
      texturePrompt: "gray stone",
      stylePrompt: "painted",
      status: "approved",
    });

    const firstTextures = await t.query(api.studio.listTerrainTextures, {
      workspaceId: first._id,
    });
    const secondTextures = await t.query(api.studio.listTerrainTextures, {
      workspaceId: second._id,
    });

    expect(firstTextures.map((texture) => texture.label)).toEqual([
      "First Shared",
    ]);
    expect(secondTextures.map((texture) => texture.label)).toEqual([
      "Second Shared",
    ]);
  });

  it("bootstraps existing unscoped studio data into an admin workspace", async () => {
    const previousSecret = process.env.WORKSPACE_BOOTSTRAP_SECRET;
    process.env.WORKSPACE_BOOTSTRAP_SECRET = "test-secret";
    const t = asUser(testBackend(), "owner");

    try {
      await t.run(async (ctx) => {
        const adminUserId = await ctx.db.insert("users", {
          email: "admin@example.com",
        });
        const mapId = await ctx.db.insert("studioMaps", {
          name: "Unscoped",
          width: 2,
          height: 2,
          mapJson: "{}",
          createdAt: 1,
          updatedAt: 1,
        });

        await ctx.db.insert("gameWorlds", {
          worldKey: "unscoped-world",
          name: "Unscoped World",
          runtimeKind: "convex",
          readBackend: "convex",
          writeBackend: "convex",
          studioMapId: mapId,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });

        return adminUserId;
      });

      const result = await t.mutation(
        api.workspaceBootstrap.bootstrapDefaultWorkspace,
        {
          ownerEmail: "admin@example.com",
          workspaceName: "Open Wilds Studio",
          secret: "test-secret",
          confirm: "BACKFILL_EXISTING_STUDIO_ASSETS",
        }
      );

      const snapshot = await t.run(async (ctx) => {
        const map = await ctx.db.query("studioMaps").first();
        const world = await ctx.db.query("gameWorlds").first();
        const member = await ctx.db
          .query("studioWorkspaceMembers")
          .withIndex("by_workspaceId_and_role", (q) =>
            q.eq("workspaceId", result.workspaceId!).eq("role", "owner")
          )
          .first();

        return { map, member, world };
      });

      expect(result.counts.maps).toBe(1);
      expect(snapshot.map?.workspaceId).toBe(result.workspaceId);
      expect(snapshot.world?.workspaceId).toBe(result.workspaceId);
      expect(snapshot.member?.role).toBe("owner");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.WORKSPACE_BOOTSTRAP_SECRET;
      } else {
        process.env.WORKSPACE_BOOTSTRAP_SECRET = previousSecret;
      }
    }
  });
});
