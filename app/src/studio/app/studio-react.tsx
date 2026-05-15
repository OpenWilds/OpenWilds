import { useConvexAuth } from "@convex-dev/auth/react";
import { Authenticated, useConvex, useMutation, useQuery } from "convex/react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  ConvexAuthenticatedUser,
  ConvexAuthBoundary,
  ConvexAuthScreen,
  createConvexAuthClient,
  userLabel,
} from "../../auth/convex-auth";
import type { TerrainVisualAsset } from "../../assets/visual-assets";
import { setStudioConvexClient } from "../convex/convex-studio";
import { StudioShell } from "./StudioShell";
import { refs, textureRecordToSourceTexture } from "../lib/studio-data";
import type { WorkspaceRole } from "../lib/studio-types";

declare const __OPEN_WILDS_CONVEX_URL__: string;

const convexUrl = __OPEN_WILDS_CONVEX_URL__;
const SELECTED_WORKSPACE_KEY = "open-wilds:studio:selected-workspace";
const MCP_AUTH_PATH = "/studio/mcp-auth";
const ENABLE_MCP_DEV_ACCESS =
  import.meta.env.DEV || import.meta.env.VITE_STUDIO_MCP_DEV_ACCESS === "1";

export const bootStudio = (app: HTMLElement) => {
  app.classList.add("studio-app");

  const root = createRoot(app);

  if (!convexUrl) {
    root.render(<StudioApp offline />);
    return root;
  }

  const convex = createConvexAuthClient(convexUrl);
  const isMcpAuthRoute =
    window.location.pathname.replace(/\/$/, "") === MCP_AUTH_PATH;

  root.render(
    <ConvexAuthBoundary client={convex}>
      <ConvexAuthScreen label="Open Wilds Studio" />
      <Authenticated>
        {isMcpAuthRoute ? (
          <StudioMcpAuthBridge />
        ) : (
          <ConvexAuthenticatedUser label="Open Wilds Studio">
            {({ signOut, user }) => (
              <StudioApp
                onSignOut={() => void signOut()}
                userLabel={userLabel(user)}
              />
            )}
          </ConvexAuthenticatedUser>
        )}
      </Authenticated>
    </ConvexAuthBoundary>
  );

  return root;
};

function StudioMcpAuthBridge() {
  const { fetchAccessToken, isLoading } = useConvexAuth();
  const [status, setStatus] = useState("Connecting Studio to MCP...");

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const callback = url.searchParams.get("callback");
        const state = url.searchParams.get("state");

        if (!callback || !state) {
          throw new Error("Missing MCP callback details.");
        }

        const callbackUrl = new URL(callback);
        if (!isAllowedMcpCallback(callbackUrl)) {
          throw new Error("MCP callback must point to localhost.");
        }

        const token = await fetchAccessToken({ forceRefreshToken: true });
        const refreshToken = readConvexAuthStorage("__convexAuthRefreshToken");

        if (!token) {
          throw new Error("Studio session is not authenticated.");
        }

        if (cancelled) {
          return;
        }

        setStatus("Authentication complete. Returning to MCP...");
        postMcpAuth(callbackUrl, {
          refreshToken: refreshToken ?? "",
          state,
          token,
        });
      } catch (error) {
        if (!cancelled) {
          setStatus(toErrorMessage(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchAccessToken, isLoading]);

  return (
    <section className="auth-gate">
      <div className="auth-panel">
        <p className="eyebrow">Open Wilds Studio</p>
        <h1>MCP Login</h1>
        <p>{status}</p>
      </div>
    </section>
  );
}

function StudioApp({
  offline = false,
  onSignOut,
  userLabel,
}: {
  offline?: boolean;
  onSignOut?: () => void;
  userLabel?: string;
}) {
  if (offline) {
    return (
      <StudioShell
        offline
        sourceTextures={[]}
        generatedTerrains={[]}
        objectSprites={[]}
        plantSprites={[]}
        savedWorlds={[]}
        userLabel="Offline Studio"
      />
    );
  }

  return <ReactiveStudioShell onSignOut={onSignOut} userLabel={userLabel} />;
}

function ReactiveStudioShell({
  onSignOut,
  userLabel,
}: {
  onSignOut?: () => void;
  userLabel?: string;
}) {
  const convex = useConvex();
  const { fetchAccessToken } = useConvexAuth();
  const createWorkspace = useMutation(refs.createWorkspace);
  const createInvite = useMutation(refs.createInvite);
  const acceptInvite = useMutation(refs.acceptInvite);
  const declineInvite = useMutation(refs.declineInvite);
  const revokeInvite = useMutation(refs.revokeInvite);
  const updateMemberRole = useMutation(refs.updateMemberRole);
  const removeMember = useMutation(refs.removeMember);
  const workspaces = useQuery(refs.listMyWorkspaces, {});
  const pendingInvites = useQuery(refs.listMyInvites, {});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => window.localStorage.getItem(SELECTED_WORKSPACE_KEY)
  );
  const selectedWorkspace =
    workspaces?.find((workspace) => workspace._id === selectedWorkspaceId) ??
    workspaces?.[0] ??
    null;
  const canManageSelectedWorkspace =
    selectedWorkspace?.role === "owner" || selectedWorkspace?.role === "admin";
  const workspaceId = selectedWorkspace?._id ?? null;
  const scopedArgs = workspaceId ? { workspaceId } : "skip";
  const textureRecords = useQuery(refs.listTerrainTextures, scopedArgs);
  const terrainRecords = useQuery(
    refs.listTerrainAssets,
    workspaceId ? { workspaceId, status: "library" } : "skip"
  );
  const savedWorlds = useQuery(refs.listMaps, scopedArgs);
  const plantSprites = useQuery(
    refs.listPlantSprites,
    workspaceId ? { workspaceId, status: "library" } : "skip"
  );
  const objectSprites = useQuery(
    refs.listObjectSprites,
    workspaceId ? { workspaceId, status: "library" } : "skip"
  );
  const members = useQuery(refs.listMembers, scopedArgs);
  const workspaceInvites = useQuery(refs.listWorkspaceInvites, scopedArgs);

  useEffect(() => {
    setStudioConvexClient(convex);

    return () => setStudioConvexClient(null);
  }, [convex]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get("invite");

    if (!inviteToken) {
      return;
    }

    void acceptInvite({ token: inviteToken })
      .then(() => {
        url.searchParams.delete("invite");
        window.history.replaceState(null, "", url.toString());
      })
      .catch(() => {
        // The pending-invite panel still lets the signed-in user accept or decline.
      });
  }, [acceptInvite]);

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) {
      return;
    }

    const hasSelectedWorkspace =
      selectedWorkspaceId &&
      workspaces.some((workspace) => workspace._id === selectedWorkspaceId);
    const nextWorkspaceId = hasSelectedWorkspace
      ? selectedWorkspaceId
      : workspaces[0]._id;

    setSelectedWorkspaceId(nextWorkspaceId);
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, nextWorkspaceId);
  }, [selectedWorkspaceId, workspaces]);

  const selectWorkspace = (nextWorkspaceId: string) => {
    setSelectedWorkspaceId(nextWorkspaceId);
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, nextWorkspaceId);
  };

  const createWorkspaceFromName = async (name: string) => {
    const workspace = await createWorkspace({ name });
    selectWorkspace(workspace._id);
  };

  const inviteMember = async (email: string, role: WorkspaceRole) => {
    if (!workspaceId) {
      throw new Error("Select a workspace first.");
    }

    await createInvite({ workspaceId, email, role });
  };

  const revokeWorkspaceInvite = async (inviteId: string) => {
    if (!workspaceId) {
      throw new Error("Select a workspace first.");
    }

    await revokeInvite({ workspaceId, inviteId });
  };

  const changeMemberRole = async (
    targetUserId: string,
    role: WorkspaceRole
  ) => {
    if (!workspaceId) {
      throw new Error("Select a workspace first.");
    }

    await updateMemberRole({ workspaceId, userId: targetUserId, role });
  };

  const removeWorkspaceMember = async (targetUserId: string) => {
    if (!workspaceId) {
      throw new Error("Select a workspace first.");
    }

    await removeMember({ workspaceId, userId: targetUserId });
  };

  const copyMcpAuthToken = async () => {
    if (!ENABLE_MCP_DEV_ACCESS || !canManageSelectedWorkspace) {
      throw new Error(
        "MCP token access is only available to workspace admins in development."
      );
    }

    const token = await fetchAccessToken({ forceRefreshToken: true });

    if (!token) {
      throw new Error("Studio session is not authenticated.");
    }

    await navigator.clipboard.writeText(
      `OPEN_WILDS_STUDIO_AUTH_TOKEN=${shellQuote(token)}`
    );
  };

  const sourceTextures = useMemo(
    () =>
      (textureRecords ?? [])
        .filter((record) => record.url && record.status !== "archived")
        .map(textureRecordToSourceTexture),
    [textureRecords]
  );
  const generatedTerrains = useMemo<TerrainVisualAsset[]>(
    () =>
      (terrainRecords ?? []).flatMap((record) =>
        record.atlasUrl && record.centerVariantsUrl
          ? [
              {
                id: record.terrainId,
                label: record.label,
                atlasUrl: record.atlasUrl,
                centerVariantsUrl: record.centerVariantsUrl,
                generated: true,
              },
            ]
          : []
      ),
    [terrainRecords]
  );

  return (
    <StudioShell
      sourceTextures={sourceTextures}
      generatedTerrains={generatedTerrains}
      objectSprites={(objectSprites ?? []).filter(
        (sprite) => sprite.url && sprite.status !== "archived"
      )}
      plantSprites={(plantSprites ?? []).filter(
        (sprite) => sprite.url && sprite.status !== "archived"
      )}
      savedWorlds={savedWorlds ?? []}
      onSignOut={onSignOut}
      userLabel={userLabel}
      workspaces={workspaces ?? []}
      selectedWorkspace={selectedWorkspace}
      selectedWorkspaceId={workspaceId}
      onSelectWorkspace={selectWorkspace}
      onCreateWorkspace={createWorkspaceFromName}
      members={members ?? []}
      workspaceInvites={workspaceInvites ?? []}
      pendingInvites={pendingInvites ?? []}
      onInviteMember={inviteMember}
      onAcceptInvite={(token) => acceptInvite({ token })}
      onDeclineInvite={(token) => declineInvite({ token })}
      onRevokeInvite={revokeWorkspaceInvite}
      onUpdateMemberRole={changeMemberRole}
      onRemoveMember={removeWorkspaceMember}
      onCopyMcpAuthToken={
        ENABLE_MCP_DEV_ACCESS && canManageSelectedWorkspace
          ? copyMcpAuthToken
          : undefined
      }
      isLoading={
        workspaces === undefined ||
        pendingInvites === undefined ||
        (workspaceId !== null &&
          (textureRecords === undefined ||
            terrainRecords === undefined ||
            savedWorlds === undefined ||
            plantSprites === undefined ||
            objectSprites === undefined ||
            members === undefined ||
            workspaceInvites === undefined))
      }
    />
  );
}

function isAllowedMcpCallback(url: URL) {
  const isLoopbackHost =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  return url.protocol === "http:" && isLoopbackHost;
}

function postMcpAuth(
  callbackUrl: URL,
  fields: { refreshToken: string; state: string; token: string }
) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = callbackUrl.toString();
  form.style.display = "none";

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(form);
  form.submit();
}

function readConvexAuthStorage(key: string) {
  const storageKey = `${key}_${convexUrl.replace(/[^a-zA-Z0-9]/g, "")}`;
  return window.localStorage.getItem(storageKey);
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Error: /, "");
  }

  return "MCP authentication failed.";
}
