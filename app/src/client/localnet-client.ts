import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmRawTransaction,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import type { GridPoint } from "../game/types";
import {
  AIRDROP_SOL,
  DELEGATION_PROGRAM_ID,
  EPHEMERAL_ROLLUP_RPC_URL,
  EPHEMERAL_ROLLUP_VALIDATOR,
  LOCALNET_RPC_URL,
  PLAYER_STORAGE_KEY,
  PROGRAMS,
} from "./config";
import { shortAddress } from "./format";
import type { BoltResult, PlayerState, StoredPlayerState } from "./types";
import { HudController, type HudElements } from "./hud";
import { installAnchorProvider, loadBoltSdk } from "./sdk";
import {
  BrowserAnchorWallet,
  readBurnerWallet,
  resetBurnerWallet,
} from "./wallet";

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

const findDelegationRecordPda = (delegatedAccount: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBytes()],
    DELEGATION_PROGRAM_ID
  )[0];

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
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
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
              components: [{ componentId: PROGRAMS.position }],
            },
          ],
          args: point,
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedPosition = await this.fetchPositionOnEr(player);

      this.hud.setProgramStatus(
        `ER movement confirmed at ${confirmedPosition.x}, ${confirmedPosition.y}`
      );
      return confirmedPosition;
    } catch (error) {
      void logOnchainError("movePlayer failed", error, this.erConnection);
      this.hud.setProgramStatus(
        error instanceof Error
          ? `On-chain movement failed: ${error.message}`
          : "On-chain movement failed."
      );
      return null;
    }
  }

  private bindControls() {
    this.hud.elements.airdropButton?.addEventListener("click", () => {
      void this.airdrop();
    });

    this.hud.elements.commitButton?.addEventListener("click", () => {
      void this.commitPosition();
    });

    this.hud.elements.resetButton?.addEventListener("click", () => {
      resetBurnerWallet();
      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
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
        this.baseConnection.getMultipleAccountsInfo(Object.values(PROGRAMS)),
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
      this.hud.setProgramStatus("Start the validator and deploy programs first.");
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
      this.hud.setNetworkStatus(`Airdrop confirmed: ${shortAddress(signature)}`);
    } catch (error) {
      void logOnchainError("airdrop failed", error, this.baseConnection);
      this.hud.setNetworkStatus("Airdrop failed. Is localnet running?");
    } finally {
      this.hud.setAirdropBusy(false);
    }
  }

  private async commitPosition() {
    const player = this.playerState ?? this.readStoredPlayer();

    if (!player) {
      this.hud.setProgramStatus("Create and delegate a player before committing.");
      return;
    }

    this.hud.setCommitBusy(true);
    this.hud.setProgramStatus(
      `Committing Position ${shortAddress(player.componentPda)} back to base...`
    );

    try {
      await this.installAnchorProvider(this.erConnection);
      const { createUndelegateInstruction } = await loadBoltSdk();

      await this.sendBoltResult(
        {
          instruction: createUndelegateInstruction({
            payer: this.wallet.publicKey,
            delegatedAccount: player.componentPda,
            componentPda: PROGRAMS.position,
          }),
        },
        this.erConnection,
        { skipPreflight: true }
      );

      player.positionDelegated = false;
      this.playerState = player;
      this.writeStoredPlayer(player);
      this.hud.setProgramStatus(
        `Position committed and undelegated: ${shortAddress(
          player.componentPda
        )}`
      );
    } catch (error) {
      void logOnchainError("commitPosition failed", error, this.erConnection);
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
    const storedPlayer = this.readStoredPlayer();

    if (storedPlayer) {
      const componentInfo = await this.baseConnection.getAccountInfo(
        storedPlayer.componentPda
      );

      if (componentInfo) {
        this.playerState = storedPlayer;
        return this.ensurePositionDelegated(storedPlayer);
      }

      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
    }

    this.hud.setProgramStatus("Creating on-chain player entity...");
    await this.installAnchorProvider(this.baseConnection);

    const {
      AddEntity,
      FindRegistryPda,
      InitializeComponent,
      InitializeNewWorld,
      InitializeRegistry,
    } = await loadBoltSdk();

    const registryPda = FindRegistryPda({});
    const registryInfo = await this.baseConnection.getAccountInfo(registryPda);

    if (!registryInfo) {
      this.hud.setProgramStatus("Creating missing Bolt registry...");
      await this.sendBoltResult(
        await InitializeRegistry({
          payer: this.wallet.publicKey,
          connection: this.baseConnection,
        })
      );
    }

    const worldResult = await InitializeNewWorld({
      payer: this.wallet.publicKey,
      connection: this.baseConnection,
    });
    await this.sendBoltResult(worldResult);

    if (!worldResult.worldPda) {
      throw new Error("World PDA missing after initialization.");
    }

    const entityResult = await AddEntity({
      payer: this.wallet.publicKey,
      world: worldResult.worldPda,
      connection: this.baseConnection,
    });
    await this.sendBoltResult(entityResult);

    if (!entityResult.entityPda) {
      throw new Error("Entity PDA missing after initialization.");
    }

    const componentResult = await InitializeComponent({
      payer: this.wallet.publicKey,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.position,
    });
    await this.sendBoltResult(componentResult);

    if (!componentResult.componentPda) {
      throw new Error("Position component PDA missing after initialization.");
    }

    this.playerState = {
      worldPda: worldResult.worldPda,
      entityPda: entityResult.entityPda,
      componentPda: componentResult.componentPda,
      positionDelegated: false,
    };
    this.writeStoredPlayer(this.playerState);

    return this.ensurePositionDelegated(this.playerState);
  }

  private async ensurePositionDelegated(player: PlayerState) {
    if (await this.isPositionDelegated(player)) {
      await this.waitForPositionOnEr(player);
      player.positionDelegated = true;
      this.writeStoredPlayer(player);
      return player;
    }

    this.hud.setProgramStatus(
      `Delegating Position ${shortAddress(player.componentPda)} to ER...`
    );
    await this.installAnchorProvider(this.baseConnection);

    const { createDelegateInstruction } = await loadBoltSdk();
    const delegateResult = {
      componentPda: player.componentPda,
      instruction: createDelegateInstruction(
        {
          payer: this.wallet.publicKey,
          entity: player.entityPda,
          account: player.componentPda,
          ownerProgram: PROGRAMS.position,
        },
        0,
        new PublicKey(EPHEMERAL_ROLLUP_VALIDATOR),
        PROGRAMS.position
      ),
    };

    await this.sendBoltResult(delegateResult, this.baseConnection);
    await this.waitForPositionOnEr(player);

    player.positionDelegated = true;
    this.writeStoredPlayer(player);
    this.hud.setProgramStatus(
      `Position delegated to ER: ${shortAddress(player.componentPda)}`
    );

    return player;
  }

  private async isPositionVisibleOnEr(player: PlayerState) {
    try {
      return Boolean(
        await this.erConnection.getAccountInfo(player.componentPda)
      );
    } catch {
      return false;
    }
  }

  private async isPositionDelegated(player: PlayerState) {
    const delegationRecord = findDelegationRecordPda(player.componentPda);

    try {
      return Boolean(await this.baseConnection.getAccountInfo(delegationRecord));
    } catch {
      return false;
    }
  }

  private async waitForPositionOnEr(player: PlayerState) {
    const startedAt = Date.now();
    const timeoutMs = 15_000;

    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isPositionVisibleOnEr(player)) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    throw new Error(
      `Position delegation did not appear on ER at ${EPHEMERAL_ROLLUP_RPC_URL}.`
    );
  }

  private async fetchPositionOnEr(player: PlayerState): Promise<GridPoint> {
    const account = await this.erConnection.getAccountInfo(player.componentPda);

    if (!account || account.data.byteLength < 24) {
      throw new Error("Delegated Position account is missing on ER.");
    }

    const view = new DataView(
      account.data.buffer,
      account.data.byteOffset,
      account.data.byteLength
    );

    const readI64 = (offset: number) => {
      const low = view.getUint32(offset, true);
      const high = view.getInt32(offset + 4, true);

      return high * 0x100000000 + low;
    };

    return {
      x: readI64(8),
      y: readI64(16),
    };
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

  private readStoredPlayer(): PlayerState | null {
    const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    try {
      const state = JSON.parse(stored) as StoredPlayerState;

      if (state.wallet !== this.wallet.publicKey.toBase58()) {
        return null;
      }

      return {
        worldPda: new PublicKey(state.worldPda),
        entityPda: new PublicKey(state.entityPda),
        componentPda: new PublicKey(state.componentPda),
        positionDelegated: Boolean(state.positionDelegated),
      };
    } catch {
      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
      return null;
    }
  }

  private writeStoredPlayer(state: PlayerState) {
    const stored: StoredPlayerState = {
      wallet: this.wallet.publicKey.toBase58(),
      worldPda: state.worldPda.toBase58(),
      entityPda: state.entityPda.toBase58(),
      componentPda: state.componentPda.toBase58(),
      positionDelegated: state.positionDelegated,
    };

    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(stored));
  }
}
