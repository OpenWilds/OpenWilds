import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmRawTransaction,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import type { EnergyState, GridPoint, PlayerActionState } from "../game/types";
import {
  AIRDROP_SOL,
  EPHEMERAL_ROLLUP_RPC_URL,
  LOCALNET_RPC_URL,
  PROGRAMS,
} from "./config";
import { shortAddress } from "./format";
import {
  clearStoredPlayer,
  readStoredPlayer,
  writeStoredPlayer,
} from "./player-storage";
import type { BoltResult, PlayerState } from "./types";
import { HudController, type HudElements } from "./hud";
import { installAnchorProvider, loadBoltSdk } from "./sdk";
import {
  BrowserAnchorWallet,
  readBurnerWallet,
  resetBurnerWallet,
} from "./wallet";
import { PlayerWorldProvisioner } from "./world-provisioning";

const logOnchainError = async (
  label: string,
  error: unknown,
  connection: Connection
) => {
  console.error(`[Open Wilds] ${label}`, error);

  if (error instanceof SendTransactionError) {
    try {
      const logs = await error.getLogs(connection);
      console.error(`[Open Wilds] ${label} transaction logs`, logs);
    } catch (logsError) {
      console.error(
        `[Open Wilds] ${label} failed while reading transaction logs`,
        logsError
      );
    }
  }
};

const describeOnchainError = async (
  label: string,
  error: unknown,
  connection: Connection
) => {
  console.error(`[Open Wilds] ${label}`, error);

  if (!(error instanceof SendTransactionError)) {
    return error instanceof Error ? error.message : null;
  }

  try {
    const logs = await error.getLogs(connection);
    console.error(`[Open Wilds] ${label} transaction logs`, logs);
    const anchorErrorLog = logs.find((log) => log.includes("AnchorError"));
    const message = anchorErrorLog?.match(/Message: (.*)\.?$/)?.[1];

    return message ?? error.message;
  } catch (logsError) {
    console.error(
      `[Open Wilds] ${label} failed while reading transaction logs`,
      logsError
    );
    return error.message;
  }
};

class MissingProgramsError extends Error {}

const expectedProgramEntries = Object.entries(PROGRAMS);
const DEFAULT_MAX_ENERGY = 100;
const GRID_SIZE = 20;
const WALK_ENERGY_PER_TILE = 1;
type ProgramName = keyof typeof PROGRAMS;

export class LocalnetClient {
  private readonly baseConnection = new Connection(
    LOCALNET_RPC_URL,
    "confirmed"
  );
  private readonly erConnection = new Connection(
    EPHEMERAL_ROLLUP_RPC_URL,
    "confirmed"
  );
  private wallet = readBurnerWallet();
  private readonly hud: HudController;
  private readonly playerActionStateListeners = new Set<
    (state: PlayerActionState) => void
  >();
  private playerState: PlayerState | null = null;

  constructor(hudElements: HudElements) {
    this.hud = new HudController(hudElements);
  }

  async boot() {
    this.hud.renderWallet(this.wallet.publicKey);
    this.hud.setNetworkStatus("Connecting to localnet...");
    this.hud.setProgramStatus("Checking deployed programs...");
    this.bindControls();

    await Promise.all([this.refreshNetwork(), this.refreshBalance()]);
  }

  async movePlayer(point: GridPoint) {
    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms(["position", "energy", "movement"]);
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);
      const moveCost = this.getMoveCost(actionState.position, point);

      if (moveCost === null) {
        this.hud.setProgramStatus("Move target is outside the 20x20 board.");
        return actionState;
      }

      if (moveCost === 0) {
        this.hud.setProgramStatus("Choose a different tile to move.");
        return actionState;
      }

      const energy = this.normalizeEnergy(actionState.energy);

      if (energy.current < moveCost) {
        this.hud.setProgramStatus(
          `Not enough energy: need ${moveCost}, have ${energy.current}. Sleep to restore energy.`
        );

        return {
          ...actionState,
          energy,
        };
      }

      const { ApplySystem } = await loadBoltSdk();

      this.hud.setProgramStatus(
        `Sending ER movement tx for ${point.x}, ${point.y}...`
      );

      await this.sendBoltResult(
        await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: PROGRAMS.movement,
          world: player.worldPda,
          entities: [
            {
              entity: player.entityPda,
              components: [
                { componentId: PROGRAMS.position },
                { componentId: PROGRAMS.energy },
              ],
            },
          ],
          args: point,
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedState = await this.fetchPlayerActionStateOnEr(player);

      this.hud.setProgramStatus(
        `ER movement confirmed at ${confirmedState.position.x}, ${confirmedState.position.y}; energy ${confirmedState.energy.current}/${confirmedState.energy.max}`
      );
      return confirmedState;
    } catch (error) {
      const message = await describeOnchainError(
        "movePlayer failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        message
          ? `On-chain movement failed: ${message}`
          : "On-chain movement failed."
      );
      return null;
    }
  }

  async sleepPlayer() {
    this.hud.setSleepBusy(true);

    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms(["energy", "sleep"]);
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
      const { ApplySystem } = await loadBoltSdk();

      this.hud.setProgramStatus("Sending ER sleep tx...");

      await this.sendBoltResult(
        await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: PROGRAMS.sleep,
          world: player.worldPda,
          entities: [
            {
              entity: player.entityPda,
              components: [{ componentId: PROGRAMS.energy }],
            },
          ],
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedState = await this.fetchPlayerActionStateOnEr(player);

      this.hud.setProgramStatus(
        `Sleep confirmed; energy ${confirmedState.energy.current}/${confirmedState.energy.max}`
      );
      this.emitPlayerActionState(confirmedState);
      return confirmedState;
    } catch (error) {
      if (error instanceof MissingProgramsError) {
        this.hud.setProgramStatus(error.message);
        return null;
      }

      const message = await describeOnchainError(
        "sleepPlayer failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        message ? `Sleep failed: ${message}` : "Sleep failed."
      );
      return null;
    } finally {
      this.hud.setSleepBusy(false);
    }
  }

  subscribePlayerActionState(listener: (state: PlayerActionState) => void) {
    this.playerActionStateListeners.add(listener);

    return () => {
      this.playerActionStateListeners.delete(listener);
    };
  }

  private bindControls() {
    this.hud.elements.airdropButton?.addEventListener("click", () => {
      void this.airdrop();
    });

    this.hud.elements.sleepButton?.addEventListener("click", () => {
      void this.sleepPlayer();
    });

    this.hud.elements.commitButton?.addEventListener("click", () => {
      void this.commitPlayerState();
    });

    this.hud.elements.resetButton?.addEventListener("click", () => {
      resetBurnerWallet();
      clearStoredPlayer();
      this.wallet = readBurnerWallet();
      this.playerState = null;
      this.hud.renderWallet(this.wallet.publicKey);
      this.hud.setProgramStatus("Burner reset. Checking balance...");
      void this.refreshBalance();
    });
  }

  private async refreshNetwork() {
    try {
      const [version, programInfos] = await Promise.all([
        this.baseConnection.getVersion(),
        this.fetchProgramInfos(),
      ]);

      this.hud.setNetworkStatus(
        `Base ${version["solana-core"]} at ${LOCALNET_RPC_URL}; ER at ${EPHEMERAL_ROLLUP_RPC_URL}`
      );
      this.hud.renderPrograms(programInfos);
    } catch (error) {
      void logOnchainError(
        "network refresh failed",
        error,
        this.baseConnection
      );
      this.hud.setNetworkStatus(`Localnet unavailable at ${LOCALNET_RPC_URL}`);
      this.hud.setProgramStatus(
        "Start the validator and deploy programs first."
      );
    }
  }

  private async refreshBalance() {
    try {
      const lamports = await this.baseConnection.getBalance(
        this.wallet.publicKey
      );
      this.hud.setBalance(lamports);
    } catch (error) {
      void logOnchainError(
        "balance refresh failed",
        error,
        this.baseConnection
      );
      this.hud.setBalance(null);
    }
  }

  private async requireDeployedPrograms(programNames: ProgramName[]) {
    const entries = programNames.map((name) => [name, PROGRAMS[name]] as const);
    const programInfos = await this.baseConnection.getMultipleAccountsInfo(
      entries.map(([, programId]) => programId)
    );
    const missingPrograms = entries
      .filter(([, _programId], index) => !programInfos[index]?.executable)
      .map(([name, programId]) => `${name} ${shortAddress(programId)}`);

    if (missingPrograms.length > 0) {
      throw new MissingProgramsError(
        `Missing deployed program(s): ${missingPrograms.join(
          ", "
        )}. Run localnet deploy.`
      );
    }
  }

  private async fetchProgramInfos() {
    return this.baseConnection.getMultipleAccountsInfo(Object.values(PROGRAMS));
  }

  private async airdrop() {
    this.hud.setAirdropBusy(true);
    this.hud.setNetworkStatus(`Requesting ${AIRDROP_SOL} SOL airdrop...`);

    try {
      const signature = await this.baseConnection.requestAirdrop(
        this.wallet.publicKey,
        AIRDROP_SOL * LAMPORTS_PER_SOL
      );
      const latestBlockhash = await this.baseConnection.getLatestBlockhash();

      await this.baseConnection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      await this.refreshBalance();
      this.hud.setNetworkStatus(
        `Airdrop confirmed: ${shortAddress(signature)}`
      );
    } catch (error) {
      void logOnchainError("airdrop failed", error, this.baseConnection);
      this.hud.setNetworkStatus("Airdrop failed. Is localnet running?");
    } finally {
      this.hud.setAirdropBusy(false);
    }
  }

  private async commitPlayerState() {
    const player = this.playerState ?? readStoredPlayer(this.wallet.publicKey);

    if (!player) {
      this.hud.setProgramStatus(
        "Create and delegate a player before committing."
      );
      return;
    }

    this.hud.setCommitBusy(true);
    this.hud.setProgramStatus("Committing Position and Energy back to base...");

    try {
      await this.installAnchorProvider(this.erConnection);
      const { createUndelegateInstruction } = await loadBoltSdk();

      for (const component of [
        {
          account: player.positionComponentPda,
          programId: PROGRAMS.position,
          label: "Position",
        },
        {
          account: player.energyComponentPda,
          programId: PROGRAMS.energy,
          label: "Energy",
        },
      ]) {
        this.hud.setProgramStatus(`Committing ${component.label}...`);

        await this.sendBoltResult(
          {
            instruction: createUndelegateInstruction({
              payer: this.wallet.publicKey,
              delegatedAccount: component.account,
              componentPda: component.programId,
            }),
          },
          this.erConnection,
          { skipPreflight: true }
        );
      }

      player.positionDelegated = false;
      player.energyDelegated = false;
      this.playerState = player;
      writeStoredPlayer(this.wallet.publicKey, player);
      this.hud.setProgramStatus("Position and Energy committed.");
    } catch (error) {
      void logOnchainError(
        "commitPlayerState failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        error instanceof Error
          ? `Commit failed: ${error.message}`
          : "Commit failed."
      );
    } finally {
      this.hud.setCommitBusy(false);
    }
  }

  private async ensureOnchainPlayer() {
    this.playerState = await this.createPlayerWorldProvisioner().ensurePlayer();
    return this.playerState;
  }

  private createPlayerWorldProvisioner() {
    return new PlayerWorldProvisioner({
      baseConnection: this.baseConnection,
      erConnection: this.erConnection,
      payer: this.wallet.publicKey,
      installBaseProvider: () =>
        this.installAnchorProvider(this.baseConnection),
      sendBoltResult: (result, connection, options) =>
        this.sendBoltResult(result, connection, options),
      setStatus: (status) => this.hud.setProgramStatus(status),
    });
  }

  private async fetchPlayerActionStateOnEr(
    player: PlayerState
  ): Promise<PlayerActionState> {
    const [positionAccount, energyAccount] =
      await this.erConnection.getMultipleAccountsInfo([
        player.positionComponentPda,
        player.energyComponentPda,
      ]);

    if (!positionAccount || positionAccount.data.byteLength < 24) {
      throw new Error("Delegated Position account is missing on ER.");
    }

    if (!energyAccount || energyAccount.data.byteLength < 24) {
      throw new Error("Delegated Energy account is missing on ER.");
    }

    return {
      position: this.decodePosition(positionAccount.data),
      energy: this.decodeEnergy(energyAccount.data),
    };
  }

  private decodePosition(data: Uint8Array): GridPoint {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      x: this.readI64(view, 8),
      y: this.readI64(view, 16),
    };
  }

  private decodeEnergy(data: Uint8Array): EnergyState {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      current: this.readU64(view, 8),
      max: this.readU64(view, 16),
    };
  }

  private readI64(view: DataView, offset: number) {
    const low = view.getUint32(offset, true);
    const high = view.getInt32(offset + 4, true);

    return high * 0x100000000 + low;
  }

  private readU64(view: DataView, offset: number) {
    const low = view.getUint32(offset, true);
    const high = view.getUint32(offset + 4, true);

    return high * 0x100000000 + low;
  }

  private getMoveCost(from: GridPoint, to: GridPoint) {
    if (to.x < 0 || to.x >= GRID_SIZE || to.y < 0 || to.y >= GRID_SIZE) {
      return null;
    }

    return (
      (Math.abs(from.x - to.x) + Math.abs(from.y - to.y)) * WALK_ENERGY_PER_TILE
    );
  }

  private normalizeEnergy(energy: EnergyState) {
    if (energy.max !== 0) {
      return energy;
    }

    return {
      current: DEFAULT_MAX_ENERGY,
      max: DEFAULT_MAX_ENERGY,
    };
  }

  private emitPlayerActionState(state: PlayerActionState) {
    for (const listener of this.playerActionStateListeners) {
      listener(state);
    }
  }

  private async sendBoltResult(
    result: BoltResult,
    connection = this.baseConnection,
    options: { skipPreflight?: boolean } = {}
  ) {
    const transaction =
      result.transaction ??
      (result.instruction
        ? new Transaction().add(result.instruction)
        : undefined);

    if (!transaction) {
      throw new Error("Bolt SDK did not return a transaction.");
    }

    transaction.feePayer ??= this.wallet.publicKey;

    if (!transaction.recentBlockhash) {
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    transaction.partialSign(this.wallet);

    const signature = await sendAndConfirmRawTransaction(
      connection,
      transaction.serialize(),
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: options.skipPreflight,
      }
    );

    return signature;
  }

  private async installAnchorProvider(connection: Connection) {
    await installAnchorProvider(
      connection,
      new BrowserAnchorWallet(this.wallet)
    );
  }
}
