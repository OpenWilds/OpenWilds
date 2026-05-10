import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PROGRAMS } from "./config";
import { shortAddress } from "./format";
import type { PlayerNft } from "./player-nft";
import { PLAYER_COLORS, getPlayerColorStyle } from "./player-nft";
import { formatGameTime } from "../game/game-time";

export type HudElements = {
  networkStatus: HTMLElement | null;
  walletAddress: HTMLElement | null;
  walletBalance: HTMLElement | null;
  programStatus: HTMLElement | null;
  gameTimeStatus: HTMLElement | null;
  playerNftSelect: HTMLSelectElement | null;
  playerColorSelect: HTMLSelectElement | null;
  agentModeToggle: HTMLInputElement | null;
  agentDelegateInput: HTMLInputElement | null;
  agentScopeSelect: HTMLSelectElement | null;
  agentStatus: HTMLElement | null;
  agentRevokeButton: HTMLButtonElement | null;
  mintPlayerButton: HTMLButtonElement | null;
  airdropButton: HTMLButtonElement | null;
  sleepButton: HTMLButtonElement | null;
  commitButton: HTMLButtonElement | null;
  resetButton: HTMLButtonElement | null;
};

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
  agentModeToggle: document.getElementById(
    "agent-mode-toggle"
  ) as HTMLInputElement,
  agentDelegateInput: document.getElementById(
    "agent-delegate-input"
  ) as HTMLInputElement,
  agentScopeSelect: document.getElementById(
    "agent-scope-select"
  ) as HTMLSelectElement,
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

  constructor(readonly elements: HudElements) {
    this.renderGameTime();
    this.gameTimeInterval = window.setInterval(
      () => this.renderGameTime(),
      1000
    );
  }

  renderWallet(walletAddress: PublicKey) {
    if (this.elements.walletAddress) {
      this.elements.walletAddress.textContent = walletAddress.toBase58();
    }
  }

  renderPlayerNfts(players: PlayerNft[], activePlayer: PlayerNft | null) {
    if (this.elements.playerColorSelect) {
      this.elements.playerColorSelect.innerHTML = "";

      for (const color of PLAYER_COLORS) {
        const option = document.createElement("option");
        option.value = color.id;
        option.textContent = color.label;
        this.elements.playerColorSelect.append(option);
      }
    }

    if (!this.elements.playerNftSelect) {
      return;
    }

    this.elements.playerNftSelect.innerHTML = "";
    this.elements.playerNftSelect.disabled = players.length === 0;

    if (players.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No player NFTs";
      option.value = "";
      this.elements.playerNftSelect.append(option);
      return;
    }

    for (const player of players) {
      const style = getPlayerColorStyle(player.color);
      const option = document.createElement("option");
      option.value = player.mint.toBase58();
      option.textContent = `${player.metadata.name} · ${
        style.label
      } · ${shortAddress(player.mint)}`;
      this.elements.playerNftSelect.append(option);
    }

    if (activePlayer) {
      this.elements.playerNftSelect.value = activePlayer.mint.toBase58();
    }
  }

  setMintPlayerBusy(isBusy: boolean) {
    if (!this.elements.mintPlayerButton) {
      return;
    }

    this.elements.mintPlayerButton.disabled = isBusy;
    this.elements.mintPlayerButton.textContent = isBusy
      ? "Minting..."
      : "Mint Player";
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
    if (!this.elements.walletBalance) {
      return;
    }

    if (lamports === null) {
      this.elements.walletBalance.textContent = "Balance unavailable";
      return;
    }

    this.elements.walletBalance.textContent = `${(
      lamports / LAMPORTS_PER_SOL
    ).toFixed(3)} SOL`;
  }

  setNetworkStatus(status: string) {
    if (this.elements.networkStatus) {
      this.elements.networkStatus.textContent = status;
    }
  }

  setProgramStatus(status: string) {
    if (this.elements.programStatus) {
      this.elements.programStatus.textContent = status;
    }
  }

  renderGameTime() {
    if (this.elements.gameTimeStatus) {
      this.elements.gameTimeStatus.textContent = formatGameTime();
    }
  }

  setAirdropBusy(isBusy: boolean) {
    if (!this.elements.airdropButton) {
      return;
    }

    this.elements.airdropButton.disabled = isBusy;
    this.elements.airdropButton.textContent = isBusy
      ? "Airdropping..."
      : "Airdrop";
  }

  setCommitBusy(isBusy: boolean) {
    if (!this.elements.commitButton) {
      return;
    }

    this.elements.commitButton.disabled = isBusy;
    this.elements.commitButton.textContent = isBusy
      ? "Committing..."
      : "Commit State";
  }

  setSleepBusy(isBusy: boolean) {
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
    this.setSleepBusy(false);
  }

  setAgentModeState(args: {
    checked?: boolean;
    status?: string;
    active?: boolean;
    busy?: boolean;
  }) {
    this.agentBusy = args.busy ?? false;

    if (this.elements.agentModeToggle) {
      if (args.checked !== undefined) {
        this.elements.agentModeToggle.checked = args.checked;
      }

      this.elements.agentModeToggle.disabled = this.agentBusy;
    }

    if (this.elements.agentDelegateInput) {
      this.elements.agentDelegateInput.disabled = this.agentBusy;
    }

    if (this.elements.agentScopeSelect) {
      this.elements.agentScopeSelect.disabled = this.agentBusy;
    }

    if (this.elements.agentStatus && args.status !== undefined) {
      this.elements.agentStatus.textContent = args.status;
    }

    if (this.elements.agentRevokeButton) {
      this.elements.agentRevokeButton.hidden = !args.active;
      this.elements.agentRevokeButton.disabled = this.agentBusy;
      this.elements.agentRevokeButton.textContent = this.agentBusy
        ? "Updating..."
        : "Revoke";
    }
  }

  private setSleepAvailable(isAvailable: boolean) {
    this.sleepAvailable = isAvailable;
    this.setSleepBusy(false);
  }
}
