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

const GRID_SIZE = 20;
const CELL_SIZE = 32;
const GRID_PIXELS = GRID_SIZE * CELL_SIZE;
const GAME_WIDTH = 720;
const GAME_HEIGHT = 760;
const GRID_ORIGIN_X = (GAME_WIDTH - GRID_PIXELS) / 2;
const GRID_ORIGIN_Y = 84;
const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
const BURNER_STORAGE_KEY = "open-wilds.localnet.burner";
const PLAYER_STORAGE_KEY = "open-wilds.localnet.player";
const AIRDROP_SOL = 5;

const PROGRAMS = {
  openWilds: new PublicKey("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6"),
  position: new PublicKey("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ"),
  movement: new PublicKey("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5"),
};

type GridPoint = {
  x: number;
  y: number;
};

type HudElements = {
  networkStatus: HTMLElement | null;
  walletAddress: HTMLElement | null;
  walletBalance: HTMLElement | null;
  programStatus: HTMLElement | null;
  airdropButton: HTMLButtonElement | null;
  resetButton: HTMLButtonElement | null;
};

type StoredPlayerState = {
  wallet: string;
  worldPda: string;
  entityPda: string;
  componentPda: string;
};

type PlayerState = {
  worldPda: PublicKey;
  entityPda: PublicKey;
  componentPda: PublicKey;
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
  private readonly connection = new Connection(LOCALNET_RPC_URL, "confirmed");
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
      await this.installAnchorProvider();
      const { ApplySystem } = await loadBoltSdk();
      const player = await this.ensureOnchainPlayer();

      this.setProgramStatus(
        `Sending movement system tx for ${point.x}, ${point.y}...`
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
        })
      );

      this.setProgramStatus(
        `Movement confirmed for entity ${shortAddress(player.entityPda)}`
      );
      return true;
    } catch (error) {
      void logOnchainError("movePlayer failed", error, this.connection);
      this.setProgramStatus(
        error instanceof Error
          ? `On-chain movement failed: ${error.message}`
          : "On-chain movement failed."
      );
      return false;
    }
  }

  private async refreshNetwork() {
    try {
      const [version, programInfos] = await Promise.all([
        this.connection.getVersion(),
        this.connection.getMultipleAccountsInfo(Object.values(PROGRAMS)),
      ]);

      this.setNetworkStatus(
        `Localnet ${version["solana-core"]} at ${LOCALNET_RPC_URL}`
      );
      this.renderPrograms(programInfos);
    } catch (error) {
      void logOnchainError("network refresh failed", error, this.connection);
      this.setNetworkStatus(`Localnet unavailable at ${LOCALNET_RPC_URL}`);
      this.setProgramStatus("Start the validator and deploy programs first.");
    }
  }

  private async refreshBalance() {
    try {
      const lamports = await this.connection.getBalance(this.wallet.publicKey);
      this.setBalance(lamports);
    } catch (error) {
      void logOnchainError("balance refresh failed", error, this.connection);
      this.setBalance(null);
    }
  }

  private async airdrop() {
    this.setAirdropBusy(true);
    this.setNetworkStatus(`Requesting ${AIRDROP_SOL} SOL airdrop...`);

    try {
      const signature = await this.connection.requestAirdrop(
        this.wallet.publicKey,
        AIRDROP_SOL * LAMPORTS_PER_SOL
      );
      const latestBlockhash = await this.connection.getLatestBlockhash();

      await this.connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      await this.refreshBalance();
      this.setNetworkStatus(`Airdrop confirmed: ${shortAddress(signature)}`);
    } catch (error) {
      void logOnchainError("airdrop failed", error, this.connection);
      this.setNetworkStatus("Airdrop failed. Is localnet running?");
    } finally {
      this.setAirdropBusy(false);
    }
  }

  private async ensureOnchainPlayer() {
    const storedPlayer = this.readStoredPlayer();

    if (storedPlayer) {
      const componentInfo = await this.connection.getAccountInfo(
        storedPlayer.componentPda
      );

      if (componentInfo) {
        this.playerState = storedPlayer;
        return storedPlayer;
      }

      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
    }

    this.setProgramStatus("Creating on-chain player entity...");
    await this.installAnchorProvider();

    const {
      AddEntity,
      FindRegistryPda,
      InitializeComponent,
      InitializeNewWorld,
      InitializeRegistry,
    } = await loadBoltSdk();

    const registryPda = FindRegistryPda({});
    const registryInfo = await this.connection.getAccountInfo(registryPda);

    if (!registryInfo) {
      this.setProgramStatus("Creating missing Bolt registry...");
      await this.sendBoltResult(
        await InitializeRegistry({
          payer: this.wallet.publicKey,
          connection: this.connection,
        })
      );
    }

    const worldResult = await InitializeNewWorld({
      payer: this.wallet.publicKey,
      connection: this.connection,
    });
    await this.sendBoltResult(worldResult);

    if (!worldResult.worldPda) {
      throw new Error("World PDA missing after initialization.");
    }

    const entityResult = await AddEntity({
      payer: this.wallet.publicKey,
      world: worldResult.worldPda,
      connection: this.connection,
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
    };
    this.writeStoredPlayer(this.playerState);

    return this.playerState;
  }

  private async sendBoltResult(result: BoltResult) {
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
      const latestBlockhash = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    transaction.partialSign(this.wallet);

    const signature = await sendAndConfirmRawTransaction(
      this.connection,
      transaction.serialize(),
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      }
    );

    return signature;
  }

  private async installAnchorProvider() {
    const { AnchorProvider, setProvider } = await loadAnchorSdk();
    const provider = new AnchorProvider(
      this.connection,
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
    };

    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(stored));
  }
}

class GridScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private hover!: Phaser.GameObjects.Rectangle;
  private playerPosition: GridPoint = { x: 10, y: 10 };
  private pendingMove: GridPoint | null = null;
  private positionLabel: HTMLElement | null = null;

  constructor() {
    super("grid-scene");
  }

  create() {
    this.positionLabel = document.getElementById("player-position");

    this.cameras.main.setBackgroundColor("#f6f2e8");
    this.drawBoard();

    this.hover = this.add
      .rectangle(0, 0, CELL_SIZE - 3, CELL_SIZE - 3, 0x7cc9aa, 0.2)
      .setStrokeStyle(2, 0x2f806a, 0.45)
      .setOrigin(0)
      .setVisible(false);

    this.player = this.add
      .rectangle(0, 0, CELL_SIZE - 8, CELL_SIZE - 8, 0xe24a55)
      .setStrokeStyle(3, 0x84242b)
      .setOrigin(0);

    this.placePlayer(this.playerPosition, false);
    this.updatePositionLabel();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const point = this.pointerToGrid(pointer);

      if (!point) {
        this.hover.setVisible(false);
        return;
      }

      const world = this.gridToWorld(point);
      this.hover.setPosition(world.x + 1.5, world.y + 1.5).setVisible(true);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      void this.handlePointerDown(pointer);
    });
  }

  private async handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.pendingMove) {
      return;
    }

    const point = this.pointerToGrid(pointer);

    if (!point) {
      return;
    }

    this.pendingMove = point;
    this.hover.setVisible(false);

    const movedOnchain = await localnetClient.movePlayer(point);

    if (movedOnchain) {
      this.playerPosition = point;
      this.placePlayer(point, true);
      this.updatePositionLabel();
    }

    this.pendingMove = null;
  }

  private drawBoard() {
    const board = this.add.graphics();

    board.fillStyle(0xffffff, 1);
    board.fillRoundedRect(
      GRID_ORIGIN_X - 10,
      GRID_ORIGIN_Y - 10,
      GRID_PIXELS + 20,
      GRID_PIXELS + 20,
      8
    );

    board.fillStyle(0xd9eadc, 1);
    board.fillRect(GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_PIXELS, GRID_PIXELS);

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const color = (x + y) % 2 === 0 ? 0xecf6ee : 0xe2f0e5;
        board.fillStyle(color, 1);
        board.fillRect(
          GRID_ORIGIN_X + x * CELL_SIZE,
          GRID_ORIGIN_Y + y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE
        );
      }
    }

    board.lineStyle(1, 0x91aa96, 0.72);

    for (let index = 0; index <= GRID_SIZE; index += 1) {
      const lineOffset = index * CELL_SIZE;
      board.lineBetween(
        GRID_ORIGIN_X + lineOffset,
        GRID_ORIGIN_Y,
        GRID_ORIGIN_X + lineOffset,
        GRID_ORIGIN_Y + GRID_PIXELS
      );
      board.lineBetween(
        GRID_ORIGIN_X,
        GRID_ORIGIN_Y + lineOffset,
        GRID_ORIGIN_X + GRID_PIXELS,
        GRID_ORIGIN_Y + lineOffset
      );
    }
  }

  private placePlayer(point: GridPoint, animate: boolean) {
    const world = this.gridToWorld(point);
    const x = world.x + 4;
    const y = world.y + 4;

    if (!animate) {
      this.player.setPosition(x, y);
      return;
    }

    this.tweens.killTweensOf(this.player);
    this.tweens.add({
      targets: this.player,
      x,
      y,
      duration: 180,
      ease: "Quad.easeOut",
    });
  }

  private gridToWorld(point: GridPoint) {
    return {
      x: GRID_ORIGIN_X + point.x * CELL_SIZE,
      y: GRID_ORIGIN_Y + point.y * CELL_SIZE,
    };
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): GridPoint | null {
    const x = Math.floor((pointer.x - GRID_ORIGIN_X) / CELL_SIZE);
    const y = Math.floor((pointer.y - GRID_ORIGIN_Y) / CELL_SIZE);

    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return null;
    }

    return { x, y };
  }

  private updatePositionLabel() {
    if (!this.positionLabel) {
      return;
    }

    this.positionLabel.textContent = `Player: ${this.playerPosition.x}, ${this.playerPosition.y}`;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#f6f2e8",
  scene: GridScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

let localnetClient = new LocalnetClient({
  networkStatus: document.getElementById("network-status"),
  walletAddress: document.getElementById("wallet-address"),
  walletBalance: document.getElementById("wallet-balance"),
  programStatus: document.getElementById("program-status"),
  airdropButton: document.getElementById("airdrop-button") as HTMLButtonElement,
  resetButton: document.getElementById("reset-button") as HTMLButtonElement,
});

void localnetClient.boot();
