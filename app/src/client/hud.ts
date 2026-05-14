import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PROGRAMS } from "./config";
import { shortAddress } from "./format";
import type { PlayerNft } from "./player-nft";
import { PLAYER_COLORS, getPlayerColorStyle } from "./player-nft";
import { formatGameTime } from "../game/game-time";
import {
  getPlayerSpriteSheetUrl,
  type PlayerSpriteAssetId,
} from "../assets/visual-assets";

export type HudElements = {
  networkStatus: HTMLElement | null;
  walletAddress: HTMLElement | null;
  walletBalance: HTMLElement | null;
  programStatus: HTMLElement | null;
  gameTimeStatus: HTMLElement | null;
  playerNftSelect: HTMLSelectElement | null;
  playerColorSelect: HTMLSelectElement | null;
  gateWalletAddress: HTMLElement | null;
  gateWalletBalance: HTMLElement | null;
  gateProgramStatus: HTMLElement | null;
  gatePlayerNftSelect: HTMLSelectElement | null;
  gatePlayerColorSelect: HTMLSelectElement | null;
  gatePlayerColorChoices: HTMLElement | null;
  gateOwnedPlayerChoices: HTMLElement | null;
  gateMintPlayerButton: HTMLButtonElement | null;
  gateAgentModeToggle: HTMLInputElement | null;
  gateAgentDelegateInput: HTMLInputElement | null;
  gateAgentScopeSelect: HTMLSelectElement | null;
  gateAgentSessionTransactionInput: HTMLTextAreaElement | null;
  gateAgentStatus: HTMLElement | null;
  gateAgentRevokeButton: HTMLButtonElement | null;
  agentModeToggle: HTMLInputElement | null;
  agentDelegateInput: HTMLInputElement | null;
  agentScopeSelect: HTMLSelectElement | null;
  agentSessionTransactionInput: HTMLTextAreaElement | null;
  agentStatus: HTMLElement | null;
  agentRevokeButton: HTMLButtonElement | null;
  mintPlayerButton: HTMLButtonElement | null;
  airdropButton: HTMLButtonElement | null;
  sleepButton: HTMLButtonElement | null;
  commitButton: HTMLButtonElement | null;
  resetButton: HTMLButtonElement | null;
};

export type HudSnapshot = {
  walletAddress: string;
  walletBalance: string;
  networkStatus: string;
  programStatus: string;
  gameTimeStatus: string;
  agentStatus: string;
  agentActive: boolean;
  actionBusy: boolean;
  airdropBusy: boolean;
  commitBusy: boolean;
  sleepBusy: boolean;
  mintPlayerBusy: boolean;
};

export type HudSnapshotListener = (snapshot: HudSnapshot) => void;

export const getHudElements = (): HudElements => ({
  networkStatus: document.getElementById("network-status"),
  walletAddress: document.getElementById("wallet-address"),
  walletBalance: document.getElementById("wallet-balance"),
  programStatus: document.getElementById("program-status"),
  gameTimeStatus: document.getElementById("game-time-status"),
  playerNftSelect: document.getElementById(
    "player-nft-select"
  ) as HTMLSelectElement,
  playerColorSelect: document.getElementById(
    "player-color-select"
  ) as HTMLSelectElement,
  gateWalletAddress: document.getElementById("gate-wallet-address"),
  gateWalletBalance: document.getElementById("gate-wallet-balance"),
  gateProgramStatus: document.getElementById("gate-program-status"),
  gatePlayerNftSelect: document.getElementById(
    "gate-player-nft-select"
  ) as HTMLSelectElement,
  gatePlayerColorSelect: document.getElementById(
    "gate-player-color-select"
  ) as HTMLSelectElement,
  gatePlayerColorChoices: document.getElementById("gate-player-color-choices"),
  gateOwnedPlayerChoices: document.getElementById("gate-owned-player-choices"),
  gateMintPlayerButton: document.getElementById(
    "gate-mint-player-button"
  ) as HTMLButtonElement,
  gateAgentModeToggle: document.getElementById(
    "gate-agent-mode-toggle"
  ) as HTMLInputElement,
  gateAgentDelegateInput: document.getElementById(
    "gate-agent-delegate-input"
  ) as HTMLInputElement,
  gateAgentScopeSelect: document.getElementById(
    "gate-agent-scope-select"
  ) as HTMLSelectElement,
  gateAgentSessionTransactionInput: document.getElementById(
    "gate-agent-session-transaction-input"
  ) as HTMLTextAreaElement,
  gateAgentStatus: document.getElementById("gate-agent-status"),
  gateAgentRevokeButton: document.getElementById(
    "gate-agent-revoke-button"
  ) as HTMLButtonElement,
  agentModeToggle: document.getElementById(
    "agent-mode-toggle"
  ) as HTMLInputElement,
  agentDelegateInput: document.getElementById(
    "agent-delegate-input"
  ) as HTMLInputElement,
  agentScopeSelect: document.getElementById(
    "agent-scope-select"
  ) as HTMLSelectElement,
  agentSessionTransactionInput: document.getElementById(
    "agent-session-transaction-input"
  ) as HTMLTextAreaElement,
  agentStatus: document.getElementById("agent-status"),
  agentRevokeButton: document.getElementById(
    "agent-revoke-button"
  ) as HTMLButtonElement,
  mintPlayerButton: document.getElementById(
    "mint-player-button"
  ) as HTMLButtonElement,
  airdropButton: document.getElementById("airdrop-button") as HTMLButtonElement,
  sleepButton: document.getElementById("sleep-button") as HTMLButtonElement,
  commitButton: document.getElementById("commit-button") as HTMLButtonElement,
  resetButton: document.getElementById("reset-button") as HTMLButtonElement,
});

export class HudController {
  private sleepAvailable = true;
  private actionBusy = false;
  private agentBusy = false;
  private gameTimeInterval: number | null = null;
  private readonly listeners = new Set<HudSnapshotListener>();
  private snapshot: HudSnapshot = {
    walletAddress: "Creating wallet...",
    walletBalance: "Balance unavailable",
    networkStatus: "Preparing localnet...",
    programStatus: "Checking deployed programs...",
    gameTimeStatus: formatGameTime(),
    agentStatus: "Inactive",
    agentActive: false,
    actionBusy: false,
    airdropBusy: false,
    commitBusy: false,
    sleepBusy: false,
    mintPlayerBusy: false,
  };

  constructor(readonly elements: HudElements) {
    this.renderGameTime();
    this.gameTimeInterval = window.setInterval(
      () => this.renderGameTime(),
      1000
    );
    this.elements.gatePlayerColorSelect?.addEventListener("change", () =>
      this.renderPlayerColorChoices()
    );
  }

  subscribe(listener: HudSnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  private updateSnapshot(patch: Partial<HudSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  renderWallet(walletAddress: PublicKey) {
    this.updateSnapshot({ walletAddress: walletAddress.toBase58() });

    if (this.elements.walletAddress) {
      this.elements.walletAddress.textContent = walletAddress.toBase58();
    }

    if (this.elements.gateWalletAddress) {
      this.elements.gateWalletAddress.textContent = walletAddress.toBase58();
    }
  }

  renderPlayerNfts(players: PlayerNft[], activePlayer: PlayerNft | null) {
    for (const colorSelect of [
      this.elements.playerColorSelect,
      this.elements.gatePlayerColorSelect,
    ]) {
      if (!colorSelect) {
        continue;
      }

      const selectedValue = colorSelect.value || PLAYER_COLORS[0].id;
      colorSelect.innerHTML = "";
      for (const color of PLAYER_COLORS) {
        const option = document.createElement("option");
        option.value = color.id;
        option.textContent = color.label;
        colorSelect.append(option);
      }
      colorSelect.value = selectedValue;
    }

    this.renderPlayerColorChoices();

    for (const playerSelect of [
      this.elements.playerNftSelect,
      this.elements.gatePlayerNftSelect,
    ]) {
      if (!playerSelect) {
        continue;
      }

      playerSelect.innerHTML = "";
      playerSelect.disabled = players.length === 0;

      if (players.length === 0) {
        const option = document.createElement("option");
        option.textContent = "No minted players";
        option.value = "";
        playerSelect.append(option);
        continue;
      }

      for (const player of players) {
        const style = getPlayerColorStyle(player.color);
        const option = document.createElement("option");
        option.value = player.mint.toBase58();
        option.textContent = `${style.label} · ${shortAddress(player.mint)}`;
        playerSelect.append(option);
      }

      if (activePlayer) {
        playerSelect.value = activePlayer.mint.toBase58();
      }
    }

    this.renderOwnedPlayerChoices(players, activePlayer);
  }

  private renderPlayerColorChoices() {
    if (!this.elements.gatePlayerColorChoices) {
      return;
    }

    const selectedValue =
      this.elements.gatePlayerColorSelect?.value || PLAYER_COLORS[0].id;
    this.elements.gatePlayerColorChoices.innerHTML = "";

    for (const color of PLAYER_COLORS) {
      const button = this.createPlayerCardButton({
        label: color.label,
        value: color.id,
        fill: color.fill,
        spriteAssetId: color.spriteAssetId,
        stroke: color.stroke,
        selected: color.id === selectedValue,
      });

      button.addEventListener("click", () => {
        if (!this.elements.gatePlayerColorSelect) {
          return;
        }

        this.elements.gatePlayerColorSelect.value = color.id;
        this.elements.gatePlayerColorSelect.dispatchEvent(
          new Event("change", { bubbles: true })
        );
        this.renderPlayerColorChoices();
      });
      this.elements.gatePlayerColorChoices.append(button);
    }
  }

  private renderOwnedPlayerChoices(
    players: PlayerNft[],
    activePlayer: PlayerNft | null
  ) {
    if (!this.elements.gateOwnedPlayerChoices) {
      return;
    }

    this.elements.gateOwnedPlayerChoices.innerHTML = "";

    if (players.length === 0) {
      const empty = document.createElement("p");
      empty.className = "player-card-grid__empty";
      empty.textContent = "Mint a player to add it to this wallet.";
      this.elements.gateOwnedPlayerChoices.append(empty);
      return;
    }

    for (const player of players) {
      const style = getPlayerColorStyle(player.color);
      const button = this.createPlayerCardButton({
        label: style.label,
        sublabel: shortAddress(player.mint),
        value: player.mint.toBase58(),
        fill: style.fill,
        spriteAssetId: style.spriteAssetId,
        stroke: style.stroke,
        selected: activePlayer?.mint.equals(player.mint) ?? false,
      });

      button.addEventListener("click", () => {
        if (!this.elements.gatePlayerNftSelect) {
          return;
        }

        this.elements.gatePlayerNftSelect.value = player.mint.toBase58();
        this.elements.gatePlayerNftSelect.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      });
      this.elements.gateOwnedPlayerChoices.append(button);
    }
  }

  private createPlayerCardButton(args: {
    label: string;
    sublabel?: string;
    value: string;
    fill: number;
    spriteAssetId: PlayerSpriteAssetId;
    stroke: number;
    selected: boolean;
  }) {
    const button = document.createElement("button");
    const spriteWrap = document.createElement("span");
    const sprite = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "player-card";
    button.dataset.value = args.value;
    button.style.setProperty("--player-fill", this.colorHex(args.fill));
    button.style.setProperty("--player-stroke", this.colorHex(args.stroke));
    button.setAttribute("aria-pressed", args.selected ? "true" : "false");

    spriteWrap.className = "player-card__sprite-wrap";
    sprite.className = "player-card__sprite";
    sprite.style.backgroundImage = `url("${getPlayerSpriteSheetUrl(
      args.spriteAssetId
    )}")`;
    spriteWrap.append(sprite);

    label.className = "player-card__label";
    label.textContent = args.sublabel
      ? `${args.label} · ${args.sublabel}`
      : args.label;

    button.append(spriteWrap, label);
    return button;
  }

  private colorHex(color: number) {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  setMintPlayerBusy(isBusy: boolean) {
    this.updateSnapshot({ mintPlayerBusy: isBusy });

    if (this.elements.mintPlayerButton) {
      this.elements.mintPlayerButton.disabled = isBusy;
      this.elements.mintPlayerButton.textContent = isBusy
        ? "Minting..."
        : "Mint Player";
    }

    if (this.elements.gateMintPlayerButton) {
      this.elements.gateMintPlayerButton.disabled = isBusy;
      this.elements.gateMintPlayerButton.textContent = isBusy
        ? "Minting..."
        : "Mint Player";
    }
  }

  renderPrograms(
    programInfos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>
  ) {
    const deployedPrograms = Object.entries(PROGRAMS).filter(
      ([, _programId], index) => programInfos[index]?.executable
    );
    const sleepProgramIndex = Object.keys(PROGRAMS).indexOf("sleep");
    this.setSleepAvailable(
      Boolean(programInfos[sleepProgramIndex]?.executable)
    );

    this.setProgramStatus(
      `${deployedPrograms.length}/${
        Object.keys(PROGRAMS).length
      } programs deployed: ${deployedPrograms
        .map(([name, id]) => `${name} ${shortAddress(id)}`)
        .join(", ")}`
    );
  }

  setBalance(lamports: number | null) {
    const walletBalance =
      lamports === null
        ? "Balance unavailable"
        : `${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL`;

    this.updateSnapshot({ walletBalance });

    if (lamports === null) {
      if (this.elements.walletBalance) {
        this.elements.walletBalance.textContent = "Balance unavailable";
      }
      if (this.elements.gateWalletBalance) {
        this.elements.gateWalletBalance.textContent = "Balance unavailable";
      }
      return;
    }

    if (this.elements.walletBalance) {
      this.elements.walletBalance.textContent = walletBalance;
    }
    if (this.elements.gateWalletBalance) {
      this.elements.gateWalletBalance.textContent = walletBalance;
    }
  }

  setNetworkStatus(status: string) {
    this.updateSnapshot({ networkStatus: status });

    if (this.elements.networkStatus) {
      this.elements.networkStatus.textContent = status;
    }
  }

  setProgramStatus(status: string) {
    this.updateSnapshot({ programStatus: status });

    if (this.elements.programStatus) {
      this.elements.programStatus.textContent = status;
    }

    if (this.elements.gateProgramStatus) {
      this.elements.gateProgramStatus.textContent = status;
    }
  }

  renderGameTime() {
    const gameTimeStatus = formatGameTime();
    this.updateSnapshot({ gameTimeStatus });

    if (this.elements.gameTimeStatus) {
      this.elements.gameTimeStatus.textContent = gameTimeStatus;
    }
  }

  setAirdropBusy(isBusy: boolean) {
    this.updateSnapshot({ airdropBusy: isBusy });

    if (!this.elements.airdropButton) {
      return;
    }

    this.elements.airdropButton.disabled = isBusy;
    this.elements.airdropButton.textContent = isBusy
      ? "Airdropping..."
      : "Airdrop";
  }

  setCommitBusy(isBusy: boolean) {
    this.updateSnapshot({ commitBusy: isBusy });

    if (!this.elements.commitButton) {
      return;
    }

    this.elements.commitButton.disabled = isBusy;
    this.elements.commitButton.textContent = isBusy
      ? "Committing..."
      : "Commit State";
  }

  setSleepBusy(isBusy: boolean) {
    this.updateSnapshot({ sleepBusy: isBusy });

    if (!this.elements.sleepButton) {
      return;
    }

    this.elements.sleepButton.disabled =
      isBusy || this.actionBusy || !this.sleepAvailable;
    this.elements.sleepButton.textContent = isBusy
      ? "Sleeping..."
      : this.actionBusy
      ? "Busy"
      : this.sleepAvailable
      ? "Sleep"
      : "Deploy Sleep";
  }

  setActionBusy(isBusy: boolean) {
    this.actionBusy = isBusy;
    this.updateSnapshot({ actionBusy: isBusy });
    this.setSleepBusy(false);
  }

  setAgentModeState(args: {
    checked?: boolean;
    status?: string;
    active?: boolean;
    busy?: boolean;
  }) {
    this.agentBusy = args.busy ?? false;
    this.updateSnapshot({
      agentStatus:
        args.status !== undefined ? args.status : this.snapshot.agentStatus,
      agentActive:
        args.active !== undefined ? args.active : this.snapshot.agentActive,
    });

    for (const toggle of [
      this.elements.agentModeToggle,
      this.elements.gateAgentModeToggle,
    ]) {
      if (!toggle) {
        continue;
      }

      if (args.checked !== undefined) {
        toggle.checked = args.checked;
      }

      toggle.disabled = this.agentBusy;
    }

    for (const input of [
      this.elements.agentDelegateInput,
      this.elements.gateAgentDelegateInput,
    ]) {
      if (input) {
        input.disabled = this.agentBusy;
      }
    }

    for (const select of [
      this.elements.agentScopeSelect,
      this.elements.gateAgentScopeSelect,
    ]) {
      if (select) {
        select.disabled = this.agentBusy;
      }
    }

    for (const textarea of [
      this.elements.agentSessionTransactionInput,
      this.elements.gateAgentSessionTransactionInput,
    ]) {
      if (textarea) {
        textarea.disabled = this.agentBusy;
      }
    }

    if (args.status !== undefined) {
      for (const status of [
        this.elements.agentStatus,
        this.elements.gateAgentStatus,
      ]) {
        if (status) {
          status.textContent = args.status;
        }
      }
    }

    for (const button of [
      this.elements.agentRevokeButton,
      this.elements.gateAgentRevokeButton,
    ]) {
      if (button) {
        button.hidden = !args.active;
        button.disabled = this.agentBusy;
        button.textContent = this.agentBusy ? "Updating..." : "Revoke";
      }
    }
  }

  private setSleepAvailable(isAvailable: boolean) {
    this.sleepAvailable = isAvailable;
    this.setSleepBusy(false);
  }
}
