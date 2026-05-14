#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

loadDotEnv(path.join(repoRoot, ".env.local"));

const convexUrl =
  process.env.OPEN_WILDS_STUDIO_CONVEX_URL ??
  process.env.VITE_CONVEX_URL ??
  process.env.CONVEX_URL ??
  "";
let authToken =
  process.env.OPEN_WILDS_STUDIO_AUTH_TOKEN ??
  process.env.CONVEX_AUTH_TOKEN ??
  "";
let authSource = authToken ? "environment" : "none";
let convexClient = null;

const protocolVersion = "2024-11-05";
const serverInfo = {
  name: "open-wilds-studio",
  version: "0.1.0",
};

const textureStatuses = ["draft", "approved", "archived"];
const terrainStatuses = ["draft", "library", "archived"];
const spriteStatuses = ["draft", "library", "archived"];
const workspaceRoles = ["owner", "admin", "editor", "viewer"];
const reasoningEfforts = ["none", "minimal", "low", "medium", "high", "xhigh"];

const refs = {
  authCurrentUser: ref("auth:currentUser"),
  authSignIn: ref("auth:signIn"),
  authSignOut: ref("auth:signOut"),
  workspaceCreate: ref("workspaces:createWorkspace"),
  workspaceListMine: ref("workspaces:listMyWorkspaces"),
  workspaceGet: ref("workspaces:getWorkspace"),
  workspaceGetMyRole: ref("workspaces:getMyRole"),
  workspaceListMembers: ref("workspaces:listMembers"),
  workspaceCreateInvite: ref("workspaces:createInvite"),
  workspaceListInvites: ref("workspaces:listWorkspaceInvites"),
  workspaceListMyInvites: ref("workspaces:listMyInvites"),
  workspaceAcceptInvite: ref("workspaces:acceptInvite"),
  workspaceDeclineInvite: ref("workspaces:declineInvite"),
  workspaceRevokeInvite: ref("workspaces:revokeInvite"),
  workspaceUpdateMemberRole: ref("workspaces:updateMemberRole"),
  workspaceRemoveMember: ref("workspaces:removeMember"),
  studioGenerateUploadUrl: ref("studio:generateUploadUrl"),
  studioGenerateSourceTexture: ref("studio:generateSourceTexture"),
  studioListTerrainTextures: ref("studio:listTerrainTextures"),
  studioRegisterSourceTexture: ref("studio:registerSourceTexture"),
  studioRegisterTerrainAsset: ref("studio:registerTerrainAsset"),
  studioBuildTerrainAsset: ref("studioTerrainBuild:buildTerrainAsset"),
  studioListTerrainAssets: ref("studio:listTerrainAssets"),
  studioGeneratePlantSprite: ref("studio:generatePlantSprite"),
  studioRegisterPlantSprite: ref("studio:registerPlantSprite"),
  studioListPlantSprites: ref("studio:listPlantSprites"),
  studioGenerateObjectSprite: ref("studio:generateObjectSprite"),
  studioRegisterObjectSprite: ref("studio:registerObjectSprite"),
  studioListObjectSprites: ref("studio:listObjectSprites"),
  studioSaveMap: ref("studio:saveMap"),
  studioListMaps: ref("studio:listMaps"),
};

const convexApiSurface = {
  "auth.currentUser": ["query", refs.authCurrentUser],
  "workspaces.createWorkspace": ["mutation", refs.workspaceCreate],
  "workspaces.listMyWorkspaces": ["query", refs.workspaceListMine],
  "workspaces.getWorkspace": ["query", refs.workspaceGet],
  "workspaces.getMyRole": ["query", refs.workspaceGetMyRole],
  "workspaces.listMembers": ["query", refs.workspaceListMembers],
  "workspaces.createInvite": ["mutation", refs.workspaceCreateInvite],
  "workspaces.listWorkspaceInvites": ["query", refs.workspaceListInvites],
  "workspaces.listMyInvites": ["query", refs.workspaceListMyInvites],
  "workspaces.acceptInvite": ["mutation", refs.workspaceAcceptInvite],
  "workspaces.declineInvite": ["mutation", refs.workspaceDeclineInvite],
  "workspaces.revokeInvite": ["mutation", refs.workspaceRevokeInvite],
  "workspaces.updateMemberRole": ["mutation", refs.workspaceUpdateMemberRole],
  "workspaces.removeMember": ["mutation", refs.workspaceRemoveMember],
  "studio.generateUploadUrl": ["mutation", refs.studioGenerateUploadUrl],
  "studio.generateSourceTexture": ["action", refs.studioGenerateSourceTexture],
  "studio.listTerrainTextures": ["query", refs.studioListTerrainTextures],
  "studio.registerSourceTexture": [
    "mutation",
    refs.studioRegisterSourceTexture,
  ],
  "studio.registerTerrainAsset": ["mutation", refs.studioRegisterTerrainAsset],
  "studio.buildTerrainAsset": ["action", refs.studioBuildTerrainAsset],
  "studio.listTerrainAssets": ["query", refs.studioListTerrainAssets],
  "studio.generatePlantSprite": ["action", refs.studioGeneratePlantSprite],
  "studio.registerPlantSprite": ["mutation", refs.studioRegisterPlantSprite],
  "studio.listPlantSprites": ["query", refs.studioListPlantSprites],
  "studio.generateObjectSprite": ["action", refs.studioGenerateObjectSprite],
  "studio.registerObjectSprite": ["mutation", refs.studioRegisterObjectSprite],
  "studio.listObjectSprites": ["query", refs.studioListObjectSprites],
  "studio.saveMap": ["mutation", refs.studioSaveMap],
  "studio.listMaps": ["query", refs.studioListMaps],
};

const tools = [
  tool({
    name: "studio_auth_status",
    title: "Studio auth status",
    description:
      "Report whether the MCP server has a Convex URL and an authenticated Studio session.",
    inputSchema: objectSchema({}),
    handler: async () => {
      const tokenInfo = authToken ? decodeJwt(authToken) : null;
      return {
        convexUrlConfigured: Boolean(convexUrl),
        convexUrl,
        authenticated: Boolean(authToken),
        authSource,
        tokenExpiresAt: tokenInfo?.exp
          ? new Date(tokenInfo.exp * 1000).toISOString()
          : null,
        currentUser: authToken ? await currentUserOrNull() : null,
      };
    },
  }),
  tool({
    name: "studio_sign_in",
    title: "Sign in to Studio",
    description:
      "Sign in with the project's Convex Auth password provider and keep the JWT in this MCP server process.",
    inputSchema: objectSchema(
      {
        email: stringSchema("Studio account email."),
        password: stringSchema("Studio account password."),
        flow: enumSchema(["signIn", "signUp"], "Password auth flow."),
      },
      ["email", "password"]
    ),
    handler: async (args) => {
      const client = getConvexClient();
      const result = await client.action(refs.authSignIn, {
        provider: "password",
        params: {
          email: args.email,
          password: args.password,
          flow: args.flow ?? "signIn",
        },
      });

      if (!result?.tokens?.token) {
        throw new Error("Studio sign-in did not return an auth token.");
      }

      authToken = result.tokens.token;
      authSource = "studio_sign_in";
      client.setAuth(authToken);
      return {
        signedIn: true,
        currentUser: await currentUserOrNull(),
      };
    },
  }),
  tool({
    name: "studio_sign_out",
    title: "Sign out of Studio",
    description:
      "Sign out the current Convex Auth session when possible, then clear this MCP server's in-memory token.",
    inputSchema: objectSchema({}),
    handler: async () => {
      const client = getConvexClient();
      let remoteSignOut = "skipped";
      if (authToken) {
        try {
          await client.action(refs.authSignOut, {});
          remoteSignOut = "ok";
        } catch (error) {
          remoteSignOut = `failed: ${toErrorMessage(error)}`;
        }
      }
      authToken = "";
      authSource = "none";
      client.clearAuth();
      return { signedOut: true, remoteSignOut };
    },
  }),
  tool({
    name: "studio_list_api_surface",
    title: "List Studio API surface",
    description:
      "List the allowlisted Convex functions exposed through this MCP server.",
    inputSchema: objectSchema({}),
    handler: async () =>
      Object.fromEntries(
        Object.entries(convexApiSurface).map(([name, [type]]) => [name, type])
      ),
  }),
  tool({
    name: "studio_call_api",
    title: "Call allowlisted Studio API",
    description:
      "Call an allowlisted Studio or workspace Convex function by name. Prefer the typed tools for normal use.",
    inputSchema: objectSchema(
      {
        functionName: enumSchema(
          Object.keys(convexApiSurface),
          "Allowlisted function name."
        ),
        args: {
          type: "object",
          description: "Arguments to pass to the Convex function.",
          additionalProperties: true,
        },
      },
      ["functionName"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex(args.functionName, args.args ?? {});
    },
  }),
  tool({
    name: "studio_list_workspaces",
    title: "List my Studio workspaces",
    description: "List workspaces visible to the signed-in Studio user.",
    inputSchema: objectSchema({}),
    handler: async () => {
      requireAuthToken();
      return await callConvex("workspaces.listMyWorkspaces", {});
    },
  }),
  tool({
    name: "studio_create_workspace",
    title: "Create Studio workspace",
    description: "Create a Studio workspace owned by the signed-in user.",
    inputSchema: objectSchema(
      { name: stringSchema("Workspace display name.") },
      ["name"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.createWorkspace", {
        name: args.name,
      });
    },
  }),
  tool({
    name: "studio_get_workspace",
    title: "Get Studio workspace",
    description: "Read one Studio workspace and the signed-in user's role.",
    inputSchema: workspaceSchema(),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.getWorkspace", {
        workspaceId: args.workspaceId,
      });
    },
  }),
  tool({
    name: "studio_get_my_role",
    title: "Get my workspace role",
    description: "Read the signed-in user's role in a Studio workspace.",
    inputSchema: workspaceSchema(),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.getMyRole", {
        workspaceId: args.workspaceId,
      });
    },
  }),
  tool({
    name: "studio_list_members",
    title: "List workspace members",
    description: "List members in a Studio workspace.",
    inputSchema: workspaceSchema(),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.listMembers", {
        workspaceId: args.workspaceId,
      });
    },
  }),
  tool({
    name: "studio_create_invite",
    title: "Create workspace invite",
    description: "Create or refresh a pending workspace invite.",
    inputSchema: objectSchema(
      {
        workspaceId: idSchema("Studio workspace id."),
        email: stringSchema("Invitee email address."),
        role: enumSchema(workspaceRoles, "Role to grant."),
      },
      ["workspaceId", "email", "role"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.createInvite", args);
    },
  }),
  tool({
    name: "studio_list_workspace_invites",
    title: "List workspace invites",
    description: "List pending invites for a workspace.",
    inputSchema: workspaceSchema(),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.listWorkspaceInvites", args);
    },
  }),
  tool({
    name: "studio_list_my_invites",
    title: "List my Studio invites",
    description:
      "List pending workspace invites for the signed-in user's email.",
    inputSchema: objectSchema({}),
    handler: async () => {
      requireAuthToken();
      return await callConvex("workspaces.listMyInvites", {});
    },
  }),
  tool({
    name: "studio_accept_invite",
    title: "Accept workspace invite",
    description: "Accept a Studio workspace invite by token.",
    inputSchema: objectSchema(
      { token: stringSchema("Workspace invite token.") },
      ["token"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.acceptInvite", { token: args.token });
    },
  }),
  tool({
    name: "studio_decline_invite",
    title: "Decline workspace invite",
    description: "Decline a Studio workspace invite by token.",
    inputSchema: objectSchema(
      { token: stringSchema("Workspace invite token.") },
      ["token"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.declineInvite", {
        token: args.token,
      });
    },
  }),
  tool({
    name: "studio_revoke_invite",
    title: "Revoke workspace invite",
    description: "Revoke a pending workspace invite.",
    inputSchema: objectSchema(
      {
        workspaceId: idSchema("Studio workspace id."),
        inviteId: idSchema("Workspace invite id."),
      },
      ["workspaceId", "inviteId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.revokeInvite", args);
    },
  }),
  tool({
    name: "studio_update_member_role",
    title: "Update workspace member role",
    description: "Change a workspace member role.",
    inputSchema: objectSchema(
      {
        workspaceId: idSchema("Studio workspace id."),
        userId: stringSchema("Workspace user id."),
        role: enumSchema(workspaceRoles, "New role."),
      },
      ["workspaceId", "userId", "role"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.updateMemberRole", args);
    },
  }),
  tool({
    name: "studio_remove_member",
    title: "Remove workspace member",
    description: "Remove a user from a workspace.",
    inputSchema: objectSchema(
      {
        workspaceId: idSchema("Studio workspace id."),
        userId: stringSchema("Workspace user id."),
      },
      ["workspaceId", "userId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("workspaces.removeMember", args);
    },
  }),
  tool({
    name: "studio_upload_file",
    title: "Upload file to Studio storage",
    description:
      "Upload a local file, data URL, or remote URL to Convex storage for a workspace.",
    inputSchema: uploadInputSchema(["workspaceId"]),
    handler: async (args) => {
      requireAuthToken();
      const upload = await uploadInput(args.workspaceId, args);
      return upload;
    },
  }),
  tool({
    name: "studio_build_terrain_texture_prompt",
    title: "Build terrain texture prompt",
    description:
      "Build the exact source texture prompt used by Terrain Studio.",
    inputSchema: terrainPromptSchema(),
    handler: async (args) => ({ prompt: buildTerrainTexturePrompt(args) }),
  }),
  tool({
    name: "studio_generate_source_texture",
    title: "Generate source texture",
    description:
      "Generate a seamless source texture through the Studio Convex action.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        ...terrainPromptFields(),
        imageModel: stringSchema("Optional OpenRouter image model."),
        reasoningEffort: enumSchema(reasoningEfforts, "Reasoning effort."),
      },
      [
        "workspaceId",
        "terrainId",
        "label",
        "material",
        "texturePrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.generateSourceTexture", compact(args));
    },
  }),
  tool({
    name: "studio_list_terrain_textures",
    title: "List terrain source textures",
    description: "List source textures saved in a Studio workspace.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        status: enumSchema(textureStatuses, "Optional texture status filter."),
      },
      ["workspaceId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.listTerrainTextures", compact(args));
    },
  }),
  tool({
    name: "studio_register_source_texture",
    title: "Register source texture",
    description:
      "Upload and register a source texture, or register an existing Convex storage id.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        ...terrainPromptFields(),
        ...uploadFields(),
        storageId: idSchema("Existing Convex storage id."),
        fileName: stringSchema("File name for an existing storage id."),
        contentType: stringSchema("Content type for an existing storage id."),
        size: numberSchema("Byte size for an existing storage id."),
        status: enumSchema(textureStatuses, "Texture status."),
      },
      [
        "workspaceId",
        "terrainId",
        "label",
        "material",
        "texturePrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      const file = args.storageId
        ? {
            storageId: args.storageId,
            fileName: requiredArg(args.fileName, "fileName"),
            contentType: requiredArg(args.contentType, "contentType"),
            size: requiredArg(args.size, "size"),
          }
        : await uploadInput(args.workspaceId, args);
      return await callConvex("studio.registerSourceTexture", {
        workspaceId: args.workspaceId,
        terrainId: args.terrainId,
        label: args.label,
        storageId: file.storageId,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        material: args.material,
        texturePrompt: args.texturePrompt,
        stylePrompt: args.stylePrompt,
        status: args.status ?? "approved",
      });
    },
  }),
  tool({
    name: "studio_register_terrain_asset",
    title: "Register terrain asset",
    description:
      "Upload and register a generated terrain atlas plus center-variant sheet.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        ...terrainPromptFields(),
        sourceTextureId: idSchema("Optional source texture id."),
        atlasStorageId: idSchema("Existing atlas storage id."),
        centerVariantsStorageId: idSchema(
          "Existing center variants storage id."
        ),
        atlasFilePath: pathSchema("Local PNG path for the 7x7 autotile atlas."),
        centerVariantsFilePath: pathSchema(
          "Local PNG path for the 4x4 center variants sheet."
        ),
        status: enumSchema(terrainStatuses, "Terrain asset status."),
        tags: arraySchema(stringSchema("Tag."), "Terrain tags."),
        walkable: booleanSchema("Whether this terrain is walkable."),
        plantable: booleanSchema("Whether this terrain is plantable."),
      },
      [
        "workspaceId",
        "terrainId",
        "label",
        "material",
        "texturePrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      const atlasStorageId =
        args.atlasStorageId ??
        (
          await uploadInput(args.workspaceId, {
            filePath: requiredArg(args.atlasFilePath, "atlasFilePath"),
            contentType: "image/png",
          })
        ).storageId;
      const centerVariantsStorageId =
        args.centerVariantsStorageId ??
        (
          await uploadInput(args.workspaceId, {
            filePath: requiredArg(
              args.centerVariantsFilePath,
              "centerVariantsFilePath"
            ),
            contentType: "image/png",
          })
        ).storageId;

      return await registerTerrainAsset(args, {
        atlasStorageId,
        centerVariantsStorageId,
      });
    },
  }),
  tool({
    name: "studio_build_terrain_asset",
    title: "Build and register terrain asset",
    description:
      "Build the 7x7 autotile atlas and 4x4 center-variants sheet in Convex from a saved or uploaded source texture, then register it in Studio.",
    inputSchema: terrainBuildSchema([
      "workspaceId",
      "terrainId",
      "label",
      "material",
      "texturePrompt",
      "stylePrompt",
    ]),
    handler: async (args) => {
      requireAuthToken();
      return await buildTerrainAssetTool(args);
    },
  }),
  tool({
    name: "studio_generate_texture_and_terrain",
    title: "Generate texture and terrain",
    description:
      "End-to-end terrain workflow: generate a source texture, build autotile assets, upload them, and register the terrain.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        ...terrainPromptFields(),
        imageModel: stringSchema("Optional OpenRouter image model."),
        reasoningEffort: enumSchema(reasoningEfforts, "Reasoning effort."),
        status: enumSchema(terrainStatuses, "Terrain asset status."),
        tags: arraySchema(stringSchema("Tag."), "Terrain tags."),
        walkable: booleanSchema("Whether this terrain is walkable."),
        plantable: booleanSchema("Whether this terrain is plantable."),
      },
      [
        "workspaceId",
        "terrainId",
        "label",
        "material",
        "texturePrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      const sourceTexture = await callConvex(
        "studio.generateSourceTexture",
        compact({
          workspaceId: args.workspaceId,
          terrainId: args.terrainId,
          label: args.label,
          material: args.material,
          texturePrompt: args.texturePrompt,
          stylePrompt: args.stylePrompt,
          imageModel: args.imageModel,
          reasoningEffort: args.reasoningEffort,
        })
      );

      if (!sourceTexture?.url) {
        throw new Error(
          "Generated source texture did not include a storage URL."
        );
      }

      const terrainAsset = await buildTerrainAssetTool({
        ...args,
        sourceTextureId: sourceTexture.textureId,
      });

      return { sourceTexture, terrainAsset };
    },
  }),
  tool({
    name: "studio_list_terrain_assets",
    title: "List terrain assets",
    description: "List terrain assets saved in a Studio workspace.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        status: enumSchema(terrainStatuses, "Optional terrain status filter."),
      },
      ["workspaceId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.listTerrainAssets", compact(args));
    },
  }),
  tool({
    name: "studio_generate_plant_sprite",
    title: "Generate plant sprite",
    description:
      "Generate and register a plant or tree sprite sheet through the Studio Convex action.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        plantId: stringSchema("Stable plant id."),
        label: stringSchema("Plant label."),
        kind: enumSchema(["plant", "tree"], "Plant sprite kind."),
        region: stringSchema("Biome or world region."),
        habitat: stringSchema("Terrain habitat description."),
        objectPrompt: stringSchema("Plant object prompt."),
        stylePrompt: stringSchema("Visual style prompt."),
        cellSize: numberSchema("Optional sprite cell size."),
        imageModel: stringSchema("Optional OpenRouter image model."),
        reasoningEffort: enumSchema(reasoningEfforts, "Reasoning effort."),
      },
      [
        "workspaceId",
        "plantId",
        "label",
        "kind",
        "region",
        "habitat",
        "objectPrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.generatePlantSprite", compact(args));
    },
  }),
  tool({
    name: "studio_register_plant_sprite",
    title: "Register plant sprite",
    description:
      "Upload and register an externally-created plant or tree sprite sheet.",
    inputSchema: plantRegisterSchema(),
    handler: async (args) => {
      requireAuthToken();
      const spriteStorageId =
        args.spriteStorageId ??
        (
          await uploadInput(args.workspaceId, {
            filePath: requiredArg(args.spriteFilePath, "spriteFilePath"),
            contentType: args.contentType ?? "image/png",
          })
        ).storageId;
      const layoutGuideStorageId =
        args.layoutGuideStorageId ??
        (args.layoutGuideFilePath
          ? (
              await uploadInput(args.workspaceId, {
                filePath: args.layoutGuideFilePath,
                contentType: "image/png",
              })
            ).storageId
          : undefined);

      return await callConvex(
        "studio.registerPlantSprite",
        compact({
          workspaceId: args.workspaceId,
          plantId: args.plantId,
          label: args.label,
          kind: args.kind,
          spriteStorageId,
          layoutGuideStorageId,
          fileName:
            args.fileName ??
            (args.spriteFilePath
              ? path.basename(args.spriteFilePath)
              : "sprite.png"),
          contentType: args.contentType ?? "image/png",
          size: args.size ?? (await inferFileSize(args.spriteFilePath)),
          status: args.status,
          region: args.region,
          habitat: args.habitat,
          objectPrompt: args.objectPrompt,
          stylePrompt: args.stylePrompt,
          generatedPrompt: args.generatedPrompt,
          model: args.model,
          rows: args.rows,
          columns: args.columns,
          cellSize: args.cellSize,
          atlasWidth: args.atlasWidth,
          atlasHeight: args.atlasHeight,
          cells: args.cells,
        })
      );
    },
  }),
  tool({
    name: "studio_list_plant_sprites",
    title: "List plant sprites",
    description: "List plant and tree sprites saved in a Studio workspace.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        status: enumSchema(spriteStatuses, "Optional sprite status filter."),
      },
      ["workspaceId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.listPlantSprites", compact(args));
    },
  }),
  tool({
    name: "studio_generate_object_sprite",
    title: "Generate object sprite",
    description:
      "Generate and register a building or object sprite through the Studio Convex action.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        objectId: stringSchema("Stable object id."),
        label: stringSchema("Object label."),
        kind: enumSchema(["building", "object"], "Object sprite kind."),
        region: stringSchema("Biome or world region."),
        habitat: stringSchema("Terrain habitat description."),
        objectPrompt: stringSchema("Object prompt."),
        stylePrompt: stringSchema("Visual style prompt."),
        imageModel: stringSchema("Optional OpenRouter image model."),
        reasoningEffort: enumSchema(reasoningEfforts, "Reasoning effort."),
      },
      [
        "workspaceId",
        "objectId",
        "label",
        "kind",
        "region",
        "habitat",
        "objectPrompt",
        "stylePrompt",
      ]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.generateObjectSprite", compact(args));
    },
  }),
  tool({
    name: "studio_register_object_sprite",
    title: "Register object sprite",
    description:
      "Upload and register an externally-created object or building sprite.",
    inputSchema: objectRegisterSchema(),
    handler: async (args) => {
      requireAuthToken();
      const spriteStorageId =
        args.spriteStorageId ??
        (
          await uploadInput(args.workspaceId, {
            filePath: requiredArg(args.spriteFilePath, "spriteFilePath"),
            contentType: args.contentType ?? "image/png",
          })
        ).storageId;

      return await callConvex(
        "studio.registerObjectSprite",
        compact({
          workspaceId: args.workspaceId,
          objectId: args.objectId,
          label: args.label,
          kind: args.kind,
          spriteStorageId,
          fileName:
            args.fileName ??
            (args.spriteFilePath
              ? path.basename(args.spriteFilePath)
              : "sprite.png"),
          contentType: args.contentType ?? "image/png",
          size: args.size ?? (await inferFileSize(args.spriteFilePath)),
          status: args.status,
          region: args.region,
          habitat: args.habitat,
          objectPrompt: args.objectPrompt,
          stylePrompt: args.stylePrompt,
          generatedPrompt: args.generatedPrompt,
          model: args.model,
        })
      );
    },
  }),
  tool({
    name: "studio_list_object_sprites",
    title: "List object sprites",
    description:
      "List object and building sprites saved in a Studio workspace.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        status: enumSchema(spriteStatuses, "Optional sprite status filter."),
      },
      ["workspaceId"]
    ),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.listObjectSprites", compact(args));
    },
  }),
  tool({
    name: "studio_save_map",
    title: "Save Studio world map",
    description: "Save a Studio world map JSON document.",
    inputSchema: objectSchema(
      {
        ...workspaceField(),
        mapId: idSchema("Existing saved map id."),
        name: stringSchema("World name."),
        width: numberSchema("Map width in tiles."),
        height: numberSchema("Map height in tiles."),
        mapJson: stringSchema("Stringified StudioMapExport JSON."),
        map: {
          type: "object",
          description: "StudioMapExport object. Used when mapJson is omitted.",
          additionalProperties: true,
        },
      },
      ["workspaceId", "name"]
    ),
    handler: async (args) => {
      requireAuthToken();
      const mapJson =
        args.mapJson ?? JSON.stringify(requiredArg(args.map, "map"));
      const parsed = JSON.parse(mapJson);
      const width = args.width ?? parsed.width;
      const height = args.height ?? parsed.height;

      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error("Map width and height are required.");
      }

      return await callConvex(
        "studio.saveMap",
        compact({
          workspaceId: args.workspaceId,
          mapId: args.mapId,
          name: args.name,
          width,
          height,
          mapJson,
        })
      );
    },
  }),
  tool({
    name: "studio_list_maps",
    title: "List Studio world maps",
    description: "List saved Studio world maps for a workspace.",
    inputSchema: workspaceSchema(),
    handler: async (args) => {
      requireAuthToken();
      return await callConvex("studio.listMaps", {
        workspaceId: args.workspaceId,
      });
    },
  }),
];

const toolByName = new Map(tools.map((entry) => [entry.name, entry]));

startStdioServer();

function ref(name) {
  return makeFunctionReference(name);
}

function tool(definition) {
  return definition;
}

async function callConvex(name, args) {
  const entry = convexApiSurface[name];
  if (!entry) {
    throw new Error(`Studio API is not allowlisted: ${name}`);
  }
  const [type, functionRef] = entry;
  const client = getConvexClient();
  if (type === "query") {
    return await client.query(functionRef, args);
  }
  if (type === "mutation") {
    return await client.mutation(functionRef, args);
  }
  return await client.action(functionRef, args);
}

function getConvexClient() {
  if (!convexUrl) {
    throw new Error(
      "Missing Convex URL. Set OPEN_WILDS_STUDIO_CONVEX_URL or VITE_CONVEX_URL."
    );
  }
  if (!convexClient) {
    convexClient = new ConvexHttpClient(convexUrl, {
      auth: authToken || undefined,
      logger: false,
      skipConvexDeploymentUrlCheck: true,
    });
    if (typeof convexClient.setDebug === "function") {
      convexClient.setDebug(false);
    }
  }
  if (authToken) {
    convexClient.setAuth(authToken);
  }
  return convexClient;
}

function requireAuthToken() {
  if (!authToken) {
    throw new Error(
      "Studio auth is required. Use studio_sign_in or set OPEN_WILDS_STUDIO_AUTH_TOKEN to a Convex Auth JWT."
    );
  }
}

async function currentUserOrNull() {
  try {
    return await callConvex("auth.currentUser", {});
  } catch {
    return null;
  }
}

async function uploadInput(workspaceId, args) {
  const input = await readInputBytes(args);
  return await uploadBytes(workspaceId, input.bytes, {
    contentType: args.contentType ?? input.contentType,
    fileName: args.fileName ?? input.fileName,
  });
}

async function uploadBytes(workspaceId, bytes, options) {
  const contentType = options.contentType ?? "application/octet-stream";
  const uploadUrl = await callConvex("studio.generateUploadUrl", {
    workspaceId,
  });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!response.ok) {
    throw new Error(`Convex upload failed (${response.status}).`);
  }

  const result = await response.json();
  return {
    storageId: result.storageId,
    fileName: options.fileName ?? "upload.bin",
    contentType,
    size: bytes.byteLength,
  };
}

async function readInputBytes(args) {
  const provided = [
    args.filePath ? "filePath" : null,
    args.dataUrl ? "dataUrl" : null,
    args.url ? "url" : null,
  ].filter(Boolean);

  if (provided.length !== 1) {
    throw new Error("Provide exactly one of filePath, dataUrl, or url.");
  }

  if (args.filePath) {
    const filePath = resolveInputPath(args.filePath);
    const bytes = await fsp.readFile(filePath);
    return {
      bytes,
      fileName: path.basename(filePath),
      contentType: inferContentType(filePath),
    };
  }

  if (args.dataUrl) {
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(
      args.dataUrl
    );
    if (!match) {
      throw new Error("dataUrl must be a base64 data URL.");
    }
    const contentType = match[1] || "application/octet-stream";
    return {
      bytes: Buffer.from(match[2], "base64"),
      fileName:
        args.fileName ?? `upload.${extensionForContentType(contentType)}`,
      contentType,
    };
  }

  const response = await fetch(args.url);
  if (!response.ok) {
    throw new Error(`Could not fetch ${args.url}: ${response.status}`);
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0] ??
    inferContentType(args.url);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    fileName: args.fileName ?? path.basename(new URL(args.url).pathname),
    contentType,
  };
}

async function registerTerrainAsset(args, storage) {
  return await callConvex(
    "studio.registerTerrainAsset",
    compact({
      workspaceId: args.workspaceId,
      terrainId: args.terrainId,
      label: args.label,
      sourceTextureId: args.sourceTextureId,
      atlasStorageId: storage.atlasStorageId,
      centerVariantsStorageId: storage.centerVariantsStorageId,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "library",
      tags: args.tags ?? [],
      walkable: args.walkable ?? true,
      plantable: args.plantable ?? true,
    })
  );
}

async function buildTerrainAssetTool(args) {
  const sourceTextureId = await ensureSourceTextureId(args);

  return await callConvex(
    "studio.buildTerrainAsset",
    compact({
      workspaceId: args.workspaceId,
      sourceTextureId,
      terrainId: args.terrainId,
      label: args.label,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "library",
      tags: args.tags ?? [],
      walkable: args.walkable ?? true,
      plantable: args.plantable ?? true,
    })
  );
}

async function ensureSourceTextureId(args) {
  if (args.sourceTextureId) {
    return args.sourceTextureId;
  }

  const uploadArgs = sourceTextureUploadArgs(args);

  if (!uploadArgs) {
    throw new Error(
      "Provide sourceTextureId, sourceTextureFilePath, sourceTextureDataUrl, or sourceTextureUrl."
    );
  }

  const file = await uploadInput(args.workspaceId, uploadArgs);

  return await callConvex("studio.registerSourceTexture", {
    workspaceId: args.workspaceId,
    terrainId: args.terrainId,
    label: args.label,
    storageId: file.storageId,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
    material: args.material,
    texturePrompt: args.texturePrompt,
    stylePrompt: args.stylePrompt,
    status: "approved",
  });
}

function sourceTextureUploadArgs(args) {
  if (args.sourceTextureFilePath) {
    return {
      filePath: args.sourceTextureFilePath,
      contentType: "image/png",
    };
  }
  if (args.sourceTextureDataUrl) {
    return {
      dataUrl: args.sourceTextureDataUrl,
      fileName: `${args.terrainId}-source-texture.png`,
      contentType: "image/png",
    };
  }
  if (args.sourceTextureUrl) {
    return {
      url: args.sourceTextureUrl,
      fileName: `${args.terrainId}-source-texture.png`,
      contentType: "image/png",
    };
  }
  return null;
}
function buildTerrainTexturePrompt(args) {
  return [
    `Create one seamless square terrain source texture for ${args.material}.`,
    "",
    `Texture brief: ${args.texturePrompt}.`,
    `Style direction: ${args.stylePrompt}.`,
    "",
    "This image will be used as the exact source texture for a 47-tile dual-grid autotile generator.",
    "Make a single flat top-down material swatch, not a tile sheet, not a map, and not a scene.",
    "The texture must be seamless or near-seamless on all four edges.",
    "Use consistent visual density across the entire square.",
    "Avoid large unique focal elements, landmarks, symbols, logos, text, UI, borders, frames, cast shadows, perspective objects, or lighting gradients.",
    "Keep the material readable when cropped into many 256px terrain tiles.",
    "Return one square PNG only.",
  ].join("\n");
}

function resolveInputPath(inputPath) {
  const resolved = path.resolve(repoRoot, inputPath);
  if (
    path.isAbsolute(inputPath) &&
    process.env.OPEN_WILDS_STUDIO_MCP_ALLOW_ABSOLUTE_PATHS === "1"
  ) {
    return inputPath;
  }
  assertInsideRepo(resolved);
  return resolved;
}

function resolveOutputPath(inputPath) {
  const resolved = path.resolve(repoRoot, inputPath);
  assertInsideRepo(resolved);
  return resolved;
}

function assertInsideRepo(resolvedPath) {
  if (
    resolvedPath !== repoRoot &&
    !resolvedPath.startsWith(`${repoRoot}${path.sep}`)
  ) {
    throw new Error(
      `Path must stay inside the repository unless OPEN_WILDS_STUDIO_MCP_ALLOW_ABSOLUTE_PATHS=1 is set: ${resolvedPath}`
    );
  }
}

async function inferFileSize(filePath) {
  if (!filePath) {
    throw new Error("size is required when spriteFilePath is omitted.");
  }
  return (await fsp.stat(resolveInputPath(filePath))).size;
}

function inferContentType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

function extensionForContentType(contentType) {
  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/jpeg") {
    return "jpg";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  if (contentType === "application/json") {
    return "json";
  }
  return "bin";
}

function startStdioServer() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        void handleMessage(line);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
}

async function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }

  if (message.id === undefined) {
    return;
  }

  try {
    const result = await handleRequest(message.method, message.params ?? {});
    send({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    sendError(message.id, -32603, toErrorMessage(error));
  }
}

async function handleRequest(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion ?? protocolVersion,
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      serverInfo,
    };
  }
  if (method === "ping") {
    return {};
  }
  if (method === "tools/list") {
    return {
      tools: tools.map(({ name, title, description, inputSchema }) => ({
        name,
        title,
        description,
        inputSchema,
      })),
    };
  }
  if (method === "tools/call") {
    const entry = toolByName.get(params.name);
    if (!entry) {
      throw new Error(`Unknown tool: ${params.name}`);
    }
    try {
      const result = await entry.handler(params.arguments ?? {});
      return toolResult(result);
    } catch (error) {
      return toolResult({ error: toErrorMessage(error) }, true);
    }
  }
  if (method === "resources/list") {
    return { resources: [] };
  }
  if (method === "prompts/list") {
    return { prompts: [] };
  }
  if (method === "logging/setLevel") {
    return {};
  }
  throw new Error(`Unsupported MCP method: ${method}`);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function toolResult(result, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError,
  };
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function requiredArg(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message.replace(/^Error: /, "");
  }
  return String(error);
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function workspaceSchema() {
  return objectSchema(workspaceField(), ["workspaceId"]);
}

function workspaceField() {
  return {
    workspaceId: idSchema("Studio workspace id."),
  };
}

function terrainPromptFields() {
  return {
    terrainId: stringSchema("Stable terrain id."),
    label: stringSchema("Human-readable terrain label."),
    material: stringSchema("Terrain material name."),
    texturePrompt: stringSchema("Texture-generation brief."),
    stylePrompt: stringSchema("Art style direction."),
  };
}

function terrainPromptSchema() {
  return objectSchema(terrainPromptFields(), [
    "terrainId",
    "label",
    "material",
    "texturePrompt",
    "stylePrompt",
  ]);
}

function uploadFields() {
  return {
    filePath: pathSchema("Workspace-relative local file path."),
    dataUrl: stringSchema("Base64 data URL."),
    url: stringSchema("Remote URL to fetch and upload."),
    fileName: stringSchema("Optional file name override."),
    contentType: stringSchema("Optional content type override."),
  };
}

function uploadInputSchema(required = []) {
  return objectSchema(
    {
      ...workspaceField(),
      ...uploadFields(),
    },
    required
  );
}

function terrainBuildSchema(required = []) {
  return objectSchema(
    {
      ...workspaceField(),
      ...terrainPromptFields(),
      sourceTextureId: idSchema("Existing Studio source texture id."),
      sourceTextureFilePath: pathSchema(
        "Workspace-relative PNG source texture path."
      ),
      sourceTextureDataUrl: stringSchema("Base64 PNG data URL."),
      sourceTextureUrl: stringSchema(
        "Remote or signed URL for a PNG source texture."
      ),
      status: enumSchema(terrainStatuses, "Terrain asset status."),
      tags: arraySchema(stringSchema("Tag."), "Terrain tags."),
      walkable: booleanSchema("Whether this terrain is walkable."),
      plantable: booleanSchema("Whether this terrain is plantable."),
    },
    required
  );
}

function plantRegisterSchema() {
  return objectSchema(
    {
      ...workspaceField(),
      plantId: stringSchema("Stable plant id."),
      label: stringSchema("Plant label."),
      kind: enumSchema(["plant", "tree"], "Plant sprite kind."),
      spriteStorageId: idSchema("Existing sprite storage id."),
      spriteFilePath: pathSchema("Workspace-relative PNG sprite sheet path."),
      layoutGuideStorageId: idSchema(
        "Optional existing layout guide storage id."
      ),
      layoutGuideFilePath: pathSchema(
        "Optional workspace-relative layout guide PNG."
      ),
      fileName: stringSchema("Sprite file name."),
      contentType: stringSchema("Sprite content type."),
      size: numberSchema("Sprite byte size."),
      status: enumSchema(spriteStatuses, "Sprite status."),
      region: stringSchema("Biome or world region."),
      habitat: stringSchema("Terrain habitat description."),
      objectPrompt: stringSchema("Plant object prompt."),
      stylePrompt: stringSchema("Visual style prompt."),
      generatedPrompt: stringSchema("Prompt used to generate the sprite."),
      model: stringSchema("Model used to generate the sprite."),
      rows: numberSchema("Sprite sheet rows."),
      columns: numberSchema("Sprite sheet columns."),
      cellSize: numberSchema("Sprite cell size."),
      atlasWidth: numberSchema("Atlas width."),
      atlasHeight: numberSchema("Atlas height."),
      cells: arraySchema(
        objectSchema({
          stateId: stringSchema("State id."),
          stateTitle: stringSchema("State title."),
          columnLabel: stringSchema("Column label."),
          row: numberSchema("Row index."),
          column: numberSchema("Column index."),
          x: numberSchema("Cell x."),
          y: numberSchema("Cell y."),
          width: numberSchema("Cell width."),
          height: numberSchema("Cell height."),
        }),
        "Plant sprite cell metadata."
      ),
    },
    [
      "workspaceId",
      "plantId",
      "label",
      "kind",
      "region",
      "habitat",
      "objectPrompt",
      "stylePrompt",
      "generatedPrompt",
      "model",
      "rows",
      "columns",
      "cellSize",
      "atlasWidth",
      "atlasHeight",
      "cells",
    ]
  );
}

function objectRegisterSchema() {
  return objectSchema(
    {
      ...workspaceField(),
      objectId: stringSchema("Stable object id."),
      label: stringSchema("Object label."),
      kind: enumSchema(["building", "object"], "Object sprite kind."),
      spriteStorageId: idSchema("Existing sprite storage id."),
      spriteFilePath: pathSchema("Workspace-relative PNG sprite path."),
      fileName: stringSchema("Sprite file name."),
      contentType: stringSchema("Sprite content type."),
      size: numberSchema("Sprite byte size."),
      status: enumSchema(spriteStatuses, "Sprite status."),
      region: stringSchema("Biome or world region."),
      habitat: stringSchema("Terrain habitat description."),
      objectPrompt: stringSchema("Object prompt."),
      stylePrompt: stringSchema("Visual style prompt."),
      generatedPrompt: stringSchema("Prompt used to generate the sprite."),
      model: stringSchema("Model used to generate the sprite."),
    },
    [
      "workspaceId",
      "objectId",
      "label",
      "kind",
      "region",
      "habitat",
      "objectPrompt",
      "stylePrompt",
      "generatedPrompt",
      "model",
    ]
  );
}

function stringSchema(description) {
  return { type: "string", description };
}

function idSchema(description) {
  return stringSchema(description);
}

function pathSchema(description) {
  return stringSchema(description);
}

function numberSchema(description) {
  return { type: "number", description };
}

function booleanSchema(description) {
  return { type: "boolean", description };
}

function enumSchema(values, description) {
  return { type: "string", enum: values, description };
}

function arraySchema(items, description) {
  return { type: "array", items, description };
}
