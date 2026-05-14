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

export const bootStudio = (app: HTMLElement) => {
  app.classList.add("studio-app");

  const root = createRoot(app);

  if (!convexUrl) {
    root.render(<StudioApp offline />);
    return root;
  }

  const convex = createConvexAuthClient(convexUrl);

  root.render(
    <ConvexAuthBoundary client={convex}>
      <ConvexAuthScreen label="Open Wilds Studio" />
      <Authenticated>
        <ConvexAuthenticatedUser label="Open Wilds Studio">
          {({ signOut, user }) => (
            <StudioApp
              onSignOut={() => void signOut()}
              userLabel={userLabel(user)}
            />
          )}
        </ConvexAuthenticatedUser>
      </Authenticated>
    </ConvexAuthBoundary>
  );

  return root;
};

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
