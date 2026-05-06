import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmRawTransaction,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import type { EnergyState, GridPoint, PlayerActionState } from "../game/types";
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

const expectedProgramEntries = Object.entries(PROGRAMS);

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
      await this.requireDeployedPrograms();
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
      void this.commitPlayerState();
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

  private async requireDeployedPrograms() {
    const programInfos = await this.fetchProgramInfos();
    const missingPrograms = expectedProgramEntries
      .filter(([, _programId], index) => !programInfos[index]?.executable)
      .map(([name, programId]) => `${name} ${shortAddress(programId)}`);

    if (missingPrograms.length > 0) {
      throw new Error(
        `Missing deployed program(s): ${missingPrograms.join(
          ", "
        )}. Run localnet deploy before moving.`
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
    const player = this.playerState ?? this.readStoredPlayer();

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
      this.writeStoredPlayer(player);
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
    const storedPlayer = this.readStoredPlayer();

    if (storedPlayer) {
      const [positionInfo, energyInfo] =
        await this.baseConnection.getMultipleAccountsInfo([
          storedPlayer.positionComponentPda,
          storedPlayer.energyComponentPda,
        ]);

      if (positionInfo && energyInfo) {
        this.playerState = storedPlayer;
        return this.ensureComponentsDelegated(storedPlayer);
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

    const positionResult = await InitializeComponent({
      payer: this.wallet.publicKey,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.position,
    });
    await this.sendBoltResult(positionResult);

    if (!positionResult.componentPda) {
      throw new Error("Position component PDA missing after initialization.");
    }

    const energyResult = await InitializeComponent({
      payer: this.wallet.publicKey,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.energy,
    });
    await this.sendBoltResult(energyResult);

    if (!energyResult.componentPda) {
      throw new Error("Energy component PDA missing after initialization.");
    }

    this.playerState = {
      worldPda: worldResult.worldPda,
      entityPda: entityResult.entityPda,
      positionComponentPda: positionResult.componentPda,
      energyComponentPda: energyResult.componentPda,
      positionDelegated: false,
      energyDelegated: false,
    };
    this.writeStoredPlayer(this.playerState);

    return this.ensureComponentsDelegated(this.playerState);
  }

  private async ensureComponentsDelegated(player: PlayerState) {
    await this.ensureComponentDelegated(player, {
      account: player.positionComponentPda,
      programId: PROGRAMS.position,
      label: "Position",
    });
    player.positionDelegated = true;

    await this.ensureComponentDelegated(player, {
      account: player.energyComponentPda,
      programId: PROGRAMS.energy,
      label: "Energy",
    });
    player.energyDelegated = true;

    this.writeStoredPlayer(player);
    return player;
  }

  private async ensureComponentDelegated(
    player: PlayerState,
    component: { account: PublicKey; programId: PublicKey; label: string }
  ) {
    if (await this.isComponentDelegated(component.account)) {
      await this.waitForComponentOnEr(component.account, component.label);
      this.writeStoredPlayer(player);
      return;
    }

    this.hud.setProgramStatus(
      `Delegating ${component.label} ${shortAddress(
        component.account
      )} to ER...`
    );
    await this.installAnchorProvider(this.baseConnection);

    const { createDelegateInstruction } = await loadBoltSdk();
    const delegateResult = {
      componentPda: component.account,
      instruction: createDelegateInstruction(
        {
          payer: this.wallet.publicKey,
          entity: player.entityPda,
          account: component.account,
          ownerProgram: component.programId,
        },
        0,
        new PublicKey(EPHEMERAL_ROLLUP_VALIDATOR),
        component.programId
      ),
    };

    await this.sendBoltResult(delegateResult, this.baseConnection);
    await this.waitForComponentOnEr(component.account, component.label);
    this.hud.setProgramStatus(
      `${component.label} delegated to ER: ${shortAddress(component.account)}`
    );
  }

  private async isComponentVisibleOnEr(componentAccount: PublicKey) {
    try {
      return Boolean(await this.erConnection.getAccountInfo(componentAccount));
    } catch {
      return false;
    }
  }

  private async isComponentDelegated(componentAccount: PublicKey) {
    const delegationRecord = findDelegationRecordPda(componentAccount);

    try {
      return Boolean(
        await this.baseConnection.getAccountInfo(delegationRecord)
      );
    } catch {
      return false;
    }
  }

  private async waitForComponentOnEr(
    componentAccount: PublicKey,
    label: string
  ) {
    const startedAt = Date.now();
    const timeoutMs = 15_000;

    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isComponentVisibleOnEr(componentAccount)) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    throw new Error(
      `${label} delegation did not appear on ER at ${EPHEMERAL_ROLLUP_RPC_URL}.`
    );
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

  private decodePosition(data: Buffer): GridPoint {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      x: this.readI64(view, 8),
      y: this.readI64(view, 16),
    };
  }

  private decodeEnergy(data: Buffer): EnergyState {
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

      const positionComponentPda =
        state.positionComponentPda ?? state.componentPda;

      if (!positionComponentPda || !state.energyComponentPda) {
        return null;
      }

      return {
        worldPda: new PublicKey(state.worldPda),
        entityPda: new PublicKey(state.entityPda),
        positionComponentPda: new PublicKey(positionComponentPda),
        energyComponentPda: new PublicKey(state.energyComponentPda),
        positionDelegated: Boolean(state.positionDelegated),
        energyDelegated: Boolean(state.energyDelegated),
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
      positionComponentPda: state.positionComponentPda.toBase58(),
      energyComponentPda: state.energyComponentPda.toBase58(),
      positionDelegated: state.positionDelegated,
      energyDelegated: state.energyDelegated,
    };

    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(stored));
  }
}
