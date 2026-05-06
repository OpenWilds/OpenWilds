import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PROGRAMS } from "./config";
import { shortAddress } from "./format";

export type HudElements = {
  networkStatus: HTMLElement | null;
  walletAddress: HTMLElement | null;
  walletBalance: HTMLElement | null;
  programStatus: HTMLElement | null;
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
  airdropButton: document.getElementById("airdrop-button") as HTMLButtonElement,
  sleepButton: document.getElementById("sleep-button") as HTMLButtonElement,
  commitButton: document.getElementById("commit-button") as HTMLButtonElement,
  resetButton: document.getElementById("reset-button") as HTMLButtonElement,
});

export class HudController {
  private sleepAvailable = true;

  constructor(readonly elements: HudElements) {}

  renderWallet(walletAddress: PublicKey) {
    if (this.elements.walletAddress) {
      this.elements.walletAddress.textContent = walletAddress.toBase58();
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

    this.elements.sleepButton.disabled = isBusy || !this.sleepAvailable;
    this.elements.sleepButton.textContent = isBusy
      ? "Sleeping..."
      : this.sleepAvailable
      ? "Sleep"
      : "Deploy Sleep";
  }

  private setSleepAvailable(isAvailable: boolean) {
    this.sleepAvailable = isAvailable;
    this.setSleepBusy(false);
  }
}
