import {
  CubeIcon,
  DatabaseIcon,
  HouseIcon,
  ImageSquareIcon,
  MapTrifoldIcon,
  PlantIcon,
  SignOutIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import React, { useEffect, useMemo, useState } from "react";

import openWildsLogoUrl from "../../assets/openwilds-logo.png?url";
import type { TerrainVisualAsset } from "../../assets/visual-assets";
import type { StudioSourceTexture } from "../convex/convex-studio";
import { useStudioRoute } from "../hooks/use-studio-route";
import { ROUTES } from "../lib/studio-data";
import type {
  StudioMapRecord,
  StudioObjectSpriteRecord,
  StudioPendingWorkspaceInvite,
  StudioPlantSpriteRecord,
  StudioRouteId,
  StudioWorkspaceInvite,
  StudioWorkspaceMember,
  StudioWorkspaceSummary,
  WorkspaceRole,
} from "../lib/studio-types";
import { AssetsView } from "../views/AssetsView";
import { DashboardView } from "../views/DashboardView";
import { ObjectStudioView } from "../views/ObjectStudioView";
import { PlantStudioView } from "../views/PlantStudioView";
import { TextureStudioView } from "../views/TextureStudioView";
import { WorldStudioView } from "../views/WorldStudioView";

const ROUTE_ICONS: Record<StudioRouteId, Icon> = {
  assets: DatabaseIcon,
  dashboard: SquaresFourIcon,
  map: MapTrifoldIcon,
  objects: CubeIcon,
  plants: PlantIcon,
  textures: ImageSquareIcon,
};

export function StudioShell({
  generatedTerrains,
  offline = false,
  objectSprites,
  onSignOut,
  plantSprites,
  savedWorlds,
  sourceTextures,
  userLabel = "Creator Admin",
  workspaces = [],
  selectedWorkspace = null,
  selectedWorkspaceId = null,
  onSelectWorkspace,
  onCreateWorkspace,
  members = [],
  workspaceInvites = [],
  pendingInvites = [],
  onInviteMember,
  onAcceptInvite,
  onDeclineInvite,
  onRevokeInvite,
  onUpdateMemberRole,
  onRemoveMember,
  onCopyMcpAuthToken,
}: {
  generatedTerrains: TerrainVisualAsset[];
  isLoading?: boolean;
  offline?: boolean;
  objectSprites: StudioObjectSpriteRecord[];
  onSignOut?: () => void;
  plantSprites: StudioPlantSpriteRecord[];
  savedWorlds: StudioMapRecord[];
  sourceTextures: StudioSourceTexture[];
  userLabel?: string;
  workspaces?: StudioWorkspaceSummary[];
  selectedWorkspace?: StudioWorkspaceSummary | null;
  selectedWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void;
  onCreateWorkspace?: (name: string) => Promise<void>;
  members?: StudioWorkspaceMember[];
  workspaceInvites?: StudioWorkspaceInvite[];
  pendingInvites?: StudioPendingWorkspaceInvite[];
  onInviteMember?: (email: string, role: WorkspaceRole) => Promise<void>;
  onAcceptInvite?: (token: string) => Promise<unknown>;
  onDeclineInvite?: (token: string) => Promise<unknown>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onUpdateMemberRole?: (userId: string, role: WorkspaceRole) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
  onCopyMcpAuthToken?: () => Promise<void>;
}) {
  const [route, setRoute] = useStudioRoute();
  const [selectedSourceTexture, setSelectedSourceTexture] =
    useState<StudioSourceTexture | null>(null);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const canEditWorkspace =
    selectedWorkspace?.role === "owner" ||
    selectedWorkspace?.role === "admin" ||
    selectedWorkspace?.role === "editor";
  const canManageWorkspace =
    selectedWorkspace?.role === "owner" || selectedWorkspace?.role === "admin";
  const workspaceMark = useMemo(() => {
    const label = selectedWorkspace?.name ?? "Workspace";

    return (
      label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "WS"
    );
  }, [selectedWorkspace]);
  const workspaceTooltip = selectedWorkspace
    ? `${selectedWorkspace.name} - ${selectedWorkspace.role}`
    : "Create workspace";

  useEffect(() => {
    if (selectedSourceTexture) {
      const nextTexture = sourceTextures.find(
        (texture) => texture.textureId === selectedSourceTexture.textureId
      );

      if (nextTexture) {
        setSelectedSourceTexture(nextTexture);
      }
    }
  }, [selectedSourceTexture, sourceTextures]);

  return (
    <section className="studio-shell">
      <aside className="studio-sidebar" aria-label="Studio navigation">
        <div
          aria-label="OpenWilds Studio"
          className="studio-brand"
          data-tooltip="OpenWilds Studio"
        >
          <img
            alt=""
            aria-hidden="true"
            className="studio-brand__logo"
            draggable={false}
            src={openWildsLogoUrl}
          />
        </div>
        <nav className="studio-nav" aria-label="Studio sections">
          {Object.values(ROUTES).map((item) => (
            <button
              aria-label={item.title}
              data-active={route === item.id ? "" : undefined}
              data-tooltip={item.title}
              key={item.id}
              onClick={() => setRoute(item.id)}
              type="button"
            >
              {React.createElement(ROUTE_ICONS[item.id], {
                "aria-hidden": true,
                size: 22,
                weight: route === item.id ? "fill" : "bold",
              })}
            </button>
          ))}
        </nav>
        <div className="studio-sidebar-actions">
          <button
            aria-label="Workspaces"
            className="studio-workspace-button"
            data-tooltip={workspaceTooltip}
            onClick={() => setWorkspacePanelOpen(true)}
            type="button"
          >
            <UsersThreeIcon aria-hidden="true" size={18} weight="bold" />
            <span>{workspaceMark}</span>
          </button>
          <div
            aria-label={`${userLabel} - ${
              offline ? "Offline Studio" : "Convex Studio"
            }`}
            className="studio-user-card"
            data-tooltip={`${userLabel} - ${
              offline ? "Offline Studio" : "Convex Studio"
            }`}
          >
            <div className="studio-user-card__avatar" aria-hidden="true">
              {userLabel.trim().charAt(0).toUpperCase() || "A"}
            </div>
          </div>
          {onSignOut ? (
            <button
              aria-label="Sign out"
              className="studio-link studio-link--button"
              data-tooltip="Sign out"
              onClick={onSignOut}
              type="button"
            >
              <SignOutIcon aria-hidden="true" size={22} weight="bold" />
            </button>
          ) : null}
          <a
            aria-label="Back to game"
            className="studio-link"
            data-tooltip="Back to game"
            href="/"
          >
            <HouseIcon aria-hidden="true" size={22} weight="bold" />
          </a>
        </div>
      </aside>

      <main className="studio-main">
        {!selectedWorkspaceId && !offline ? (
          <WorkspaceRequiredView
            onAcceptInvite={onAcceptInvite}
            onCreateWorkspace={onCreateWorkspace}
            onDeclineInvite={onDeclineInvite}
            pendingInvites={pendingInvites}
          />
        ) : route === "dashboard" ? (
          <DashboardView
            plantSpriteCount={plantSprites.length}
            setRoute={setRoute}
            sourceTextureCount={sourceTextures.length}
            terrainCount={generatedTerrains.length}
          />
        ) : null}
        {route === "textures" ? (
          <TextureStudioView
            generatedTerrains={generatedTerrains}
            offline={offline}
            readOnly={!canEditWorkspace}
            selectedSourceTexture={selectedSourceTexture}
            setSelectedSourceTexture={setSelectedSourceTexture}
            sourceTextures={sourceTextures}
            workspaceId={selectedWorkspaceId ?? ""}
          />
        ) : null}
        {route === "map" ? (
          <WorldStudioView
            generatedTerrains={generatedTerrains}
            objectSprites={objectSprites}
            plantSprites={plantSprites}
            readOnly={!canEditWorkspace}
            savedWorlds={savedWorlds}
            workspaceId={selectedWorkspaceId ?? ""}
          />
        ) : null}
        {route === "plants" ? (
          <PlantStudioView
            offline={offline}
            plantSprites={plantSprites}
            readOnly={!canEditWorkspace}
            workspaceId={selectedWorkspaceId ?? ""}
          />
        ) : null}
        {route === "objects" ? (
          <ObjectStudioView
            objectSprites={objectSprites}
            offline={offline}
            readOnly={!canEditWorkspace}
            workspaceId={selectedWorkspaceId ?? ""}
          />
        ) : null}
        {route === "assets" ? <AssetsView setRoute={setRoute} /> : null}
      </main>
      {workspacePanelOpen ? (
        <WorkspacePanel
          canManageWorkspace={canManageWorkspace}
          currentUserLabel={userLabel}
          members={members}
          onAcceptInvite={onAcceptInvite}
          onClose={() => setWorkspacePanelOpen(false)}
          onCreateWorkspace={onCreateWorkspace}
          onDeclineInvite={onDeclineInvite}
          onInviteMember={onInviteMember}
          onRemoveMember={onRemoveMember}
          onRevokeInvite={onRevokeInvite}
          onSelectWorkspace={onSelectWorkspace}
          onUpdateMemberRole={onUpdateMemberRole}
          onCopyMcpAuthToken={onCopyMcpAuthToken}
          pendingInvites={pendingInvites}
          selectedWorkspace={selectedWorkspace}
          workspaceInvites={workspaceInvites}
          workspaces={workspaces}
        />
      ) : null}
    </section>
  );
}

const editableRoles: WorkspaceRole[] = ["viewer", "editor", "admin", "owner"];

function WorkspaceRequiredView({
  onAcceptInvite,
  onCreateWorkspace,
  onDeclineInvite,
  pendingInvites,
}: {
  onAcceptInvite?: (token: string) => Promise<unknown>;
  onCreateWorkspace?: (name: string) => Promise<void>;
  onDeclineInvite?: (token: string) => Promise<unknown>;
  pendingInvites: StudioPendingWorkspaceInvite[];
}) {
  const [name, setName] = useState("Open Wilds Studio");
  const [status, setStatus] = useState<string | null>(null);

  const createWorkspace = async () => {
    if (!onCreateWorkspace) {
      return;
    }

    try {
      setStatus("Creating workspace...");
      await onCreateWorkspace(name);
      setStatus(null);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not create workspace."
      );
    }
  };

  return (
    <section className="studio-page">
      <div className="studio-empty-module studio-empty-module--page">
        <span aria-hidden="true" />
        <h2>Create a Workspace</h2>
        <p>
          Studio assets, plants, objects, and worlds are scoped by workspace.
        </p>
        <label className="studio-workspace-field">
          Workspace name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="studio-primary-action"
          onClick={createWorkspace}
          type="button"
        >
          Create Workspace
        </button>
        {pendingInvites.length > 0 ? (
          <div className="studio-workspace-list">
            {pendingInvites.map((invite) => (
              <div className="studio-workspace-row" key={invite._id}>
                <span>
                  <strong>
                    {invite.workspace?.name ?? "Workspace invite"}
                  </strong>
                  <small>{invite.role}</small>
                </span>
                <button
                  onClick={() => void onAcceptInvite?.(invite.token)}
                  type="button"
                >
                  Accept
                </button>
                <button
                  onClick={() => void onDeclineInvite?.(invite.token)}
                  type="button"
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {status ? <p className="studio-note">{status}</p> : null}
      </div>
    </section>
  );
}

function WorkspacePanel({
  canManageWorkspace,
  members,
  onAcceptInvite,
  onClose,
  onCreateWorkspace,
  onDeclineInvite,
  onInviteMember,
  onRemoveMember,
  onRevokeInvite,
  onSelectWorkspace,
  onUpdateMemberRole,
  onCopyMcpAuthToken,
  pendingInvites,
  selectedWorkspace,
  workspaceInvites,
  workspaces,
}: {
  canManageWorkspace: boolean;
  currentUserLabel: string;
  members: StudioWorkspaceMember[];
  onAcceptInvite?: (token: string) => Promise<unknown>;
  onClose: () => void;
  onCreateWorkspace?: (name: string) => Promise<void>;
  onDeclineInvite?: (token: string) => Promise<unknown>;
  onInviteMember?: (email: string, role: WorkspaceRole) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onSelectWorkspace?: (workspaceId: string) => void;
  onUpdateMemberRole?: (userId: string, role: WorkspaceRole) => Promise<void>;
  onCopyMcpAuthToken?: () => Promise<void>;
  pendingInvites: StudioPendingWorkspaceInvite[];
  selectedWorkspace: StudioWorkspaceSummary | null;
  workspaceInvites: StudioWorkspaceInvite[];
  workspaces: StudioWorkspaceSummary[];
}) {
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("editor");
  const [status, setStatus] = useState<string | null>(null);

  const runPanelAction = async (
    action: () => Promise<unknown>,
    success: string
  ) => {
    try {
      setStatus(null);
      await action();
      setStatus(success);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Workspace action failed."
      );
    }
  };

  const createWorkspace = () =>
    runPanelAction(async () => {
      await onCreateWorkspace?.(newWorkspaceName);
      setNewWorkspaceName("");
    }, "Workspace created.");

  const inviteMember = () =>
    runPanelAction(async () => {
      await onInviteMember?.(inviteEmail, inviteRole);
      setInviteEmail("");
    }, "Invite created.");

  const copyMcpAuthToken = () =>
    runPanelAction(async () => {
      if (!onCopyMcpAuthToken) {
        throw new Error("MCP access is not available for this workspace.");
      }

      await onCopyMcpAuthToken();
    }, "MCP auth token env copied.");

  return (
    <div className="studio-modal-backdrop" role="presentation">
      <section className="studio-modal" aria-label="Workspace management">
        <header className="studio-modal__header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>{selectedWorkspace?.name ?? "Workspaces"}</h2>
          </div>
          <button
            aria-label="Close workspace panel"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="studio-workspace-panel-grid">
          <section>
            <h3>Switch</h3>
            <div className="studio-workspace-list">
              {workspaces.map((workspace) => (
                <button
                  data-active={
                    workspace._id === selectedWorkspace?._id ? "" : undefined
                  }
                  key={workspace._id}
                  onClick={() => onSelectWorkspace?.(workspace._id)}
                  type="button"
                >
                  <span>
                    <strong>{workspace.name}</strong>
                    <small>{workspace.role}</small>
                  </span>
                </button>
              ))}
            </div>
            <label className="studio-workspace-field">
              New workspace
              <input
                placeholder="Team workspace"
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
              />
            </label>
            <button onClick={createWorkspace} type="button">
              Create Workspace
            </button>
          </section>

          <section>
            <h3>Members</h3>
            <div className="studio-workspace-list">
              {members.map((member) => (
                <div className="studio-workspace-row" key={member._id}>
                  <span>
                    <strong>
                      {member.user.name || member.user.email || member.userId}
                    </strong>
                    <small>{member.user.email ?? member.userId}</small>
                  </span>
                  <select
                    disabled={!canManageWorkspace}
                    value={member.role}
                    onChange={(event) =>
                      void onUpdateMemberRole?.(
                        member.userId,
                        event.target.value as WorkspaceRole
                      )
                    }
                  >
                    {editableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!canManageWorkspace}
                    onClick={() => void onRemoveMember?.(member.userId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3>Invites</h3>
            {canManageWorkspace ? (
              <div className="studio-workspace-invite-form">
                <input
                  placeholder="teammate@example.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as WorkspaceRole)
                  }
                >
                  {editableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button onClick={inviteMember} type="button">
                  Create Invite
                </button>
              </div>
            ) : null}
            <div className="studio-workspace-list">
              {workspaceInvites.map((invite) => (
                <div className="studio-workspace-row" key={invite._id}>
                  <span>
                    <strong>{invite.email}</strong>
                    <small>{invite.role}</small>
                  </span>
                  <button
                    onClick={() => void copyInviteLink(invite.token, setStatus)}
                    type="button"
                  >
                    Copy Link
                  </button>
                  <button
                    disabled={!canManageWorkspace}
                    onClick={() => void onRevokeInvite?.(invite._id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </section>

          {pendingInvites.length > 0 ? (
            <section>
              <h3>Pending For You</h3>
              <div className="studio-workspace-list">
                {pendingInvites.map((invite) => (
                  <div className="studio-workspace-row" key={invite._id}>
                    <span>
                      <strong>{invite.workspace?.name ?? "Workspace"}</strong>
                      <small>{invite.role}</small>
                    </span>
                    <button
                      onClick={() => void onAcceptInvite?.(invite.token)}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => void onDeclineInvite?.(invite.token)}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {canManageWorkspace && onCopyMcpAuthToken ? (
            <section className="studio-workspace-mcp-access">
              <h3>MCP Access</h3>
              <p>
                Copy a short-lived auth env line for local Codex MCP testing.
              </p>
              <button onClick={copyMcpAuthToken} type="button">
                Copy Token Env
              </button>
            </section>
          ) : null}
        </div>

        {status ? <p className="studio-generator-status">{status}</p> : null}
      </section>
    </div>
  );
}

async function copyInviteLink(
  token: string,
  setStatus: (status: string | null) => void
) {
  const url = new URL(window.location.href);
  url.searchParams.set("invite", token);
  await navigator.clipboard.writeText(url.toString());
  setStatus("Invite link copied.");
}
