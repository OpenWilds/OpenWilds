import Phaser from "phaser";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmRawTransaction,
  SendTransactionError,
  Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  createGridScene,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "./game/grid-scene";
import type { GridPoint } from "./game/types";
import "./styles.css";

const browserGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: {
    browser?: boolean;
    env: Record<string, string>;
  };
};

browserGlobal.Buffer ??= Buffer;
browserGlobal.process ??= {
  browser: true,
  env: { NODE_ENV: "development" },
};

const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
const EPHEMERAL_ROLLUP_RPC_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ER_RPC_URL ?? "http://127.0.0.1:7799";
const EPHEMERAL_ROLLUP_VALIDATOR =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ER_VALIDATOR ?? "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";
const BURNER_STORAGE_KEY = "open-wilds.localnet.burner";
const PLAYER_STORAGE_KEY = "open-wilds.localnet.player";
const AIRDROP_SOL = 5;

const PROGRAMS = {
  openWilds: new PublicKey("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6"),
  position: new PublicKey("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ"),
  movement: new PublicKey("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5"),
};
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

type HudElements = {
  networkStatus: HTMLElement | null;
  walletAddress: HTMLElement | null;
  walletBalance: HTMLElement | null;
  programStatus: HTMLElement | null;
  airdropButton: HTMLButtonElement | null;
  commitButton: HTMLButtonElement | null;
  resetButton: HTMLButtonElement | null;
};

type StoredPlayerState = {
  wallet: string;
  worldPda: string;
  entityPda: string;
  componentPda: string;
  positionDelegated?: boolean;
};

type PlayerState = {
  worldPda: PublicKey;
  entityPda: PublicKey;
  componentPda: PublicKey;
  positionDelegated: boolean;
};

type BoltResult = {
  transaction?: Transaction;
  instruction?: TransactionInstruction;
  worldPda?: PublicKey;
  entityPda?: PublicKey;
  componentPda?: PublicKey;
};

type BoltSdk = {
  AddEntity: (args: {
    payer: PublicKey;
    world: PublicKey;
    connection: Connection;
  }) => Promise<BoltResult>;
  ApplySystem: (args: {
    authority: PublicKey;
    systemId: PublicKey;
    world: PublicKey;
    entities: Array<{
      entity: PublicKey;
      components: Array<{ componentId: PublicKey }>;
    }>;
    args?: GridPoint;
  }) => Promise<BoltResult>;
  DelegateComponent: (args: {
    payer: PublicKey;
    entity: PublicKey;
    componentId: PublicKey;
    seed?: string;
  }) => Promise<BoltResult>;
  createDelegateInstruction: (
    accounts: {
      payer: PublicKey;
      entity: PublicKey;
      account: PublicKey;
      ownerProgram: PublicKey;
    },
    commitFrequencyMs?: number,
    validator?: PublicKey,
    programId?: PublicKey
  ) => TransactionInstruction;
  createUndelegateInstruction: (args: {
    payer: PublicKey;
    delegatedAccount: PublicKey;
    componentPda: PublicKey;
  }) => TransactionInstruction;
  FindRegistryPda: (args: { programId?: PublicKey }) => PublicKey;
  InitializeComponent: (args: {
    payer: PublicKey;
    entity: PublicKey;
    componentId: PublicKey;
  }) => Promise<BoltResult>;
  InitializeNewWorld: (args: {
    payer: PublicKey;
    connection: Connection;
  }) => Promise<BoltResult>;
  InitializeRegistry: (args: {
    payer: PublicKey;
    connection: Connection;
  }) => Promise<BoltResult>;
};

type AnchorSdk = {
  AnchorProvider: new (
    connection: Connection,
    wallet: BrowserAnchorWallet,
    opts: {
      commitment: "confirmed";
      preflightCommitment: "confirmed";
    }
  ) => unknown;
  setProvider: (provider: unknown) => void;
};

type BurnerSignedTransaction = Transaction | VersionedTransaction;

let boltSdkPromise: Promise<BoltSdk> | null = null;
let anchorSdkPromise: Promise<AnchorSdk> | null = null;

const shortAddress = (value: PublicKey | string) => {
  const address = value.toString();

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const findDelegationRecordPda = (delegatedAccount: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBytes()],
    DELEGATION_PROGRAM_ID
  )[0];

const readBurnerWallet = () => {
  const storedSecret = window.localStorage.getItem(BURNER_STORAGE_KEY);

  if (!storedSecret) {
    const wallet = Keypair.generate();
    window.localStorage.setItem(
      BURNER_STORAGE_KEY,
      JSON.stringify(Array.from(wallet.secretKey))
    );
    return wallet;
  }

  try {
    const secretKey = Uint8Array.from(JSON.parse(storedSecret));
    return Keypair.fromSecretKey(secretKey);
  } catch {
    window.localStorage.removeItem(BURNER_STORAGE_KEY);
    return readBurnerWallet();
  }
};

const loadBoltSdk = () => {
  boltSdkPromise ??= import("@magicblock-labs/bolt-sdk").then(
    (sdk) => sdk as unknown as BoltSdk
  );

  return boltSdkPromise;
};

const loadAnchorSdk = () => {
  anchorSdkPromise ??= import("@coral-xyz/anchor").then(
    (sdk) => sdk as unknown as AnchorSdk
  );

  return anchorSdkPromise;
};

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

class BrowserAnchorWallet {
  readonly publicKey: PublicKey;

  constructor(private readonly keypair: Keypair) {
    this.publicKey = keypair.publicKey;
  }

  async signTransaction<T extends BurnerSignedTransaction>(
    transaction: T
  ): Promise<T> {
    if (transaction instanceof Transaction) {
      transaction.partialSign(this.keypair);
    } else {
      transaction.sign([this.keypair]);
    }

    return transaction;
  }

  async signAllTransactions<T extends BurnerSignedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    return Promise.all(
      transactions.map((transaction) => this.signTransaction(transaction))
    );
  }
}

class LocalnetClient {
  private readonly baseConnection = new Connection(
    LOCALNET_RPC_URL,
    "confirmed"
  );
  private readonly erConnection = new Connection(
    EPHEMERAL_ROLLUP_RPC_URL,
    "confirmed"
  );
  private wallet = readBurnerWallet();
  private readonly hud: HudElements;
  private playerState: PlayerState | null = null;

  constructor(hud: HudElements) {
    this.hud = hud;
  }

  async boot() {
    this.renderWallet();
    this.setNetworkStatus("Connecting to localnet...");
    this.setProgramStatus("Checking deployed programs...");
    this.bindControls();

    await Promise.all([this.refreshNetwork(), this.refreshBalance()]);
  }

  private bindControls() {
    this.hud.airdropButton?.addEventListener("click", () => {
      void this.airdrop();
    });

    this.hud.commitButton?.addEventListener("click", () => {
      void this.commitPosition();
    });

    this.hud.resetButton?.addEventListener("click", () => {
      window.localStorage.removeItem(BURNER_STORAGE_KEY);
      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
      this.wallet = readBurnerWallet();
      this.playerState = null;
      this.renderWallet();
      this.setProgramStatus("Burner reset. Checking balance...");
      void this.refreshBalance();
    });
  }

  async movePlayer(point: GridPoint) {
    try {
      await this.installAnchorProvider(this.baseConnection);
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
      const { ApplySystem } = await loadBoltSdk();

      this.setProgramStatus(
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

      this.setProgramStatus(
        `ER movement confirmed at ${confirmedPosition.x}, ${confirmedPosition.y}`
      );
      return confirmedPosition;
    } catch (error) {
      void logOnchainError("movePlayer failed", error, this.erConnection);
      this.setProgramStatus(
        error instanceof Error
          ? `On-chain movement failed: ${error.message}`
          : "On-chain movement failed."
      );
      return null;
    }
  }

  private async refreshNetwork() {
    try {
      const [version, programInfos] = await Promise.all([
        this.baseConnection.getVersion(),
        this.baseConnection.getMultipleAccountsInfo(Object.values(PROGRAMS)),
      ]);

      this.setNetworkStatus(
        `Base ${version["solana-core"]} at ${LOCALNET_RPC_URL}; ER at ${EPHEMERAL_ROLLUP_RPC_URL}`
      );
      this.renderPrograms(programInfos);
    } catch (error) {
      void logOnchainError(
        "network refresh failed",
        error,
        this.baseConnection
      );
      this.setNetworkStatus(`Localnet unavailable at ${LOCALNET_RPC_URL}`);
      this.setProgramStatus("Start the validator and deploy programs first.");
    }
  }

  private async refreshBalance() {
    try {
      const lamports = await this.baseConnection.getBalance(
        this.wallet.publicKey
      );
      this.setBalance(lamports);
    } catch (error) {
      void logOnchainError(
        "balance refresh failed",
        error,
        this.baseConnection
      );
      this.setBalance(null);
    }
  }

  private async airdrop() {
    this.setAirdropBusy(true);
    this.setNetworkStatus(`Requesting ${AIRDROP_SOL} SOL airdrop...`);

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
      this.setNetworkStatus(`Airdrop confirmed: ${shortAddress(signature)}`);
    } catch (error) {
      void logOnchainError("airdrop failed", error, this.baseConnection);
      this.setNetworkStatus("Airdrop failed. Is localnet running?");
    } finally {
      this.setAirdropBusy(false);
    }
  }

  private async commitPosition() {
    const player = this.playerState ?? this.readStoredPlayer();

    if (!player) {
      this.setProgramStatus("Create and delegate a player before committing.");
      return;
    }

    this.setCommitBusy(true);
    this.setProgramStatus(
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
      this.setProgramStatus(
        `Position committed and undelegated: ${shortAddress(
          player.componentPda
        )}`
      );
    } catch (error) {
      void logOnchainError("commitPosition failed", error, this.erConnection);
      this.setProgramStatus(
        error instanceof Error
          ? `Commit failed: ${error.message}`
          : "Commit failed."
      );
    } finally {
      this.setCommitBusy(false);
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

    this.setProgramStatus("Creating on-chain player entity...");
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
      this.setProgramStatus("Creating missing Bolt registry...");
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

    this.setProgramStatus(
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
    this.setProgramStatus(
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
    const { AnchorProvider, setProvider } = await loadAnchorSdk();
    const provider = new AnchorProvider(
      connection,
      new BrowserAnchorWallet(this.wallet),
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      }
    );

    setProvider(provider);
  }

  private renderWallet() {
    if (this.hud.walletAddress) {
      this.hud.walletAddress.textContent = this.wallet.publicKey.toBase58();
    }
  }

  private renderPrograms(
    programInfos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>
  ) {
    const deployedPrograms = Object.entries(PROGRAMS).filter(
      ([, _programId], index) => programInfos[index]?.executable
    );

    this.setProgramStatus(
      `${deployedPrograms.length}/3 programs deployed: ${deployedPrograms
        .map(([name, id]) => `${name} ${shortAddress(id)}`)
        .join(", ")}`
    );
  }

  private setBalance(lamports: number | null) {
    if (!this.hud.walletBalance) {
      return;
    }

    if (lamports === null) {
      this.hud.walletBalance.textContent = "Balance unavailable";
      return;
    }

    this.hud.walletBalance.textContent = `${(
      lamports / LAMPORTS_PER_SOL
    ).toFixed(3)} SOL`;
  }

  private setNetworkStatus(status: string) {
    if (this.hud.networkStatus) {
      this.hud.networkStatus.textContent = status;
    }
  }

  private setProgramStatus(status: string) {
    if (this.hud.programStatus) {
      this.hud.programStatus.textContent = status;
    }
  }

  private setAirdropBusy(isBusy: boolean) {
    if (!this.hud.airdropButton) {
      return;
    }

    this.hud.airdropButton.disabled = isBusy;
    this.hud.airdropButton.textContent = isBusy ? "Airdropping..." : "Airdrop";
  }

  private setCommitBusy(isBusy: boolean) {
    if (!this.hud.commitButton) {
      return;
    }

    this.hud.commitButton.disabled = isBusy;
    this.hud.commitButton.textContent = isBusy
      ? "Committing..."
      : "Commit Position";
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

let localnetClient = new LocalnetClient({
  networkStatus: document.getElementById("network-status"),
  walletAddress: document.getElementById("wallet-address"),
  walletBalance: document.getElementById("wallet-balance"),
  programStatus: document.getElementById("program-status"),
  airdropButton: document.getElementById("airdrop-button") as HTMLButtonElement,
  commitButton: document.getElementById("commit-button") as HTMLButtonElement,
  resetButton: document.getElementById("reset-button") as HTMLButtonElement,
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#f6f2e8",
  scene: createGridScene(localnetClient),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

void localnetClient.boot();
