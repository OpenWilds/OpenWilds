import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmRawTransaction,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import type {
  ActiveActionState,
  EnergyState,
  FarmActionMode,
  FarmActionResult,
  FarmTileState,
  GoldBalanceState,
  GridPoint,
  InventoryState,
  PlayerAppearance,
  PlayerActionState,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
} from "../game/types";
import { FARM_TYPES } from "../game/farm";
import { getTileTerrainDefinition } from "../game/terrain";
import { getWorldItemKey } from "../game/world-items";
import {
  AIRDROP_SOL,
  CHAIN_GENESIS_STORAGE_KEY,
  EPHEMERAL_ROLLUP_RPC_URL,
  EPHEMERAL_ROLLUP_VALIDATOR,
  LOCALNET_RPC_URL,
  PROGRAMS,
} from "./config";
import { shortAddress } from "./format";
import {
  clearStoredPlayer,
  readStoredPlayer,
  writeStoredPlayer,
} from "./player-storage";
import {
  clearActivePlayerNft,
  clearPlayerNfts,
  getPlayerColorStyle,
  listPlayerNftsInCollection,
  listOwnedPlayerNfts,
  mintPlayerNftOnchain,
  readActivePlayerNft,
  setActivePlayerNft,
  type PlayerColorId,
  type PlayerNft,
} from "./player-nft";
import type {
  BoltResult,
  PlayerState,
  TileFarmState,
  TileTerrainState,
} from "./types";
import { HudController, type HudElements } from "./hud";
import { installAnchorProvider, loadBoltSdk } from "./sdk";
import {
  BrowserAnchorWallet,
  readBurnerWallet,
  resetBurnerWallet,
} from "./wallet";
import { PlayerWorldProvisioner } from "./world-provisioning";
import {
  PLAYER_SESSION_SCOPES_MOVEMENT_ONLY,
  decodePlayerSession,
  getPlayerSessionPda,
  grantPlayerSessionInstruction,
  revokePlayerSessionInstruction,
} from "./agent-session";
import {
  OPEN_WILDS_ACCOUNT_SIZES,
  acceptTradeOfferInstruction,
  cancelTradeOfferInstruction,
  claimStarterGoldInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createTradeOfferInstruction,
  decodeTokenAmount,
  finalizeTradeOfferInstruction,
  getGoldConfigPda,
  getGoldMintPda,
  getPlayerGoldAccount,
  getPlayerGoldAuthorityPda,
  getStarterGoldClaimPda,
  getTradeAcceptancePda,
  initializeGoldConfigInstruction,
} from "./gold";

const AGENT_DELEGATE_STORAGE_KEY = "open-wilds-agent-delegate";

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
const PLAYER_STATE_SYNC_INTERVAL_MS = 500;
const TRADE_OFFER_SYNC_INTERVAL_MS = 1500;
type ProgramName = keyof typeof PROGRAMS;
type WorldCatalogEntry = {
  farmTypeId?: number;
  terrainTypeId?: number;
  entityPda: string;
  componentPda: string;
};
type GameWorldConfig = {
  terrainTypes: WorldCatalogEntry[];
  farmTypes: WorldCatalogEntry[];
  tileItems?: Array<WorldCatalogEntry & TileItemState>;
};

const ACTION_IDLE = 0;
const ACTION_MOVE = 1;
const ACTION_SLEEP = 2;
const FARM_ACTIONS = new Set([3, 4, 5, 6, 7, 8, 9]);
const STARTER_INVENTORY_ARGS = {
  turnip_seeds: 6,
  wheat_seeds: 4,
  apple_saplings: 1,
  acorns: 2,
};

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
  private readonly playerAppearanceListeners = new Set<
    (appearance: PlayerAppearance) => void
  >();
  private readonly visiblePlayerListeners = new Set<
    (players: VisiblePlayerState[]) => void
  >();
  private readonly inventoryListeners = new Set<
    (inventory: InventoryState) => void
  >();
  private readonly goldBalanceListeners = new Set<
    (balance: GoldBalanceState) => void
  >();
  private readonly tradeOfferListeners = new Set<
    (offers: TradeOfferState[]) => void
  >();
  private readonly farmTileListeners = new Set<
    (tiles: FarmTileState[]) => void
  >();
  private readonly tileItemListeners = new Set<
    (items: TileItemState[]) => void
  >();
  private playerState: PlayerState | null = null;
  private activePlayerNft: PlayerNft | null = null;
  private actionUnlockTimer: number | null = null;
  private playerStateSyncTimer: number | null = null;
  private tradeOfferSyncTimer: number | null = null;
  private playerStateSyncing = false;
  private tradeOfferSyncing = false;
  private lastPlayerActionStateKey: string | null = null;
  private lastInventoryState: InventoryState | null = null;
  private lastInventoryStateKey: string | null = null;
  private lastGoldBalanceState: GoldBalanceState = { amount: 0n };
  private lastTradeOffers: TradeOfferState[] = [];
  private lastTradeOffersKey: string | null = null;
  private lastRelevantTradeOffersKey: string | null = null;
  private lastFarmTileStates: FarmTileState[] = [];
  private lastFarmTileStateKey: string | null = null;
  private lastTileItemStates: TileItemState[] = [];
  private lastTileItemStateKey: string | null = null;
  private readonly knownPlayerTileFarms = new Map<string, TileFarmState[]>();

  constructor(hudElements: HudElements) {
    this.hud = new HudController(hudElements);
  }

  async boot() {
    this.hud.renderWallet(this.wallet.publicKey);
    this.hud.setNetworkStatus("Connecting to localnet...");
    this.hud.setProgramStatus("Checking deployed programs...");
    this.bindControls();

    await Promise.all([this.refreshNetwork(), this.refreshBalance()]);
    await this.clearStaleLocalPlayersForChainReset();
    await this.refreshPlayerNftHud();
    this.restoreAgentModeInput();
    await this.refreshAgentModeStatus();
    this.startPlayerStateSync();
    await this.syncPlayerState({ announceLoaded: true });
    await this.ensureSelectedPlayerReady();
  }

  async movePlayer(point: GridPoint) {
    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms([
        "position",
        "energy",
        "activeAction",
        "inventory",
        "playerOwner",
        "initializePlayerOwner",
        "syncPlayerOwner",
        "worldAuthority",
        "initializeWorldAuthority",
        "worldTerrainRegistry",
        "terrainType",
        "tileTerrain",
        "movement",
        "registerTerrainType",
        "defineTerrainType",
        "defineTileTerrain",
        "grantStarterInventory",
      ]);
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);

      if (this.isActionActive(actionState.activeAction)) {
        this.hud.setProgramStatus(
          `${this.describeAction(actionState.activeAction)} in progress.`
        );
        this.renderActionBusy(actionState.activeAction);
        this.emitPlayerActionState(actionState);
        return actionState;
      }

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
                { componentId: PROGRAMS.playerOwner },
                { componentId: PROGRAMS.position },
                { componentId: PROGRAMS.energy },
                { componentId: PROGRAMS.activeAction },
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
      this.renderActionBusy(confirmedState.activeAction);
      this.emitPlayerActionState(confirmedState);
      await this.syncVisiblePlayers();
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
      await this.requireDeployedPrograms([
        "energy",
        "activeAction",
        "inventory",
        "playerOwner",
        "initializePlayerOwner",
        "syncPlayerOwner",
        "worldAuthority",
        "initializeWorldAuthority",
        "worldTerrainRegistry",
        "terrainType",
        "tileTerrain",
        "sleep",
        "registerTerrainType",
        "defineTerrainType",
        "defineTileTerrain",
        "grantStarterInventory",
      ]);
      const player = await this.ensureOnchainPlayer();
      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);

      if (this.isActionActive(actionState.activeAction)) {
        this.hud.setProgramStatus(
          `${this.describeAction(actionState.activeAction)} in progress.`
        );
        this.renderActionBusy(actionState.activeAction);
        this.emitPlayerActionState(actionState);
        return actionState;
      }

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
              components: [
                { componentId: PROGRAMS.playerOwner },
                { componentId: PROGRAMS.energy },
                { componentId: PROGRAMS.activeAction },
              ],
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
      this.renderActionBusy(confirmedState.activeAction);
      this.emitPlayerActionState(confirmedState);
      await this.syncVisiblePlayers();
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

  async performFarmAction(
    mode: FarmActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ): Promise<FarmActionResult | null> {
    if (mode === "move") {
      const player = await this.movePlayer(point);
      return player
        ? {
            player,
            tile: {
              ...point,
              soilState: "untilled",
              farmTypeId: 0,
              plantedAt: 0,
              growthSeconds: 0,
              growthUpdatedAt: 0,
              wateredUntil: 0,
              lastHarvestedAt: 0,
              harvestCount: 0,
            },
          }
        : null;
    }

    if (mode === "grab") {
      return this.performGrabAction(point);
    }

    if (mode === "drop") {
      return this.performDropAction(point, selectedItemId, selectedQuantity);
    }

    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms([
        "position",
        "energy",
        "activeAction",
        "inventory",
        "tileFarm",
        "farmType",
        "terrainType",
        "tileTerrain",
        "tillTile",
        "waterTile",
        "plantTile",
        "harvestTile",
        "chopTile",
      ]);

      const player = await this.ensureOnchainPlayer();
      const tileTerrain =
        await this.createPlayerWorldProvisioner().ensureTileTerrain(
          player,
          point
        );
      const tileFarm = await this.createPlayerWorldProvisioner().ensureTileFarm(
        player,
        point
      );
      const worldConfig = await this.loadGameWorldConfig();
      const terrainDefinition = getTileTerrainDefinition(point);
      const terrainType = this.findTerrainTypeEntry(
        worldConfig,
        terrainDefinition.terrainTypeId
      );
      const farmType = await this.findFarmTypeForAction(
        mode,
        selectedItemId,
        tileFarm.componentPda,
        worldConfig
      );

      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);

      if (this.isActionActive(actionState.activeAction)) {
        this.hud.setProgramStatus(
          `${this.describeAction(actionState.activeAction)} in progress.`
        );
        this.renderActionBusy(actionState.activeAction);
        this.emitPlayerActionState(actionState);
        return null;
      }

      const { ApplySystem } = await loadBoltSdk();
      const systemId = this.getFarmActionProgram(mode);
      const { entities, extraAccounts } = this.getFarmActionAccounts(
        mode,
        player,
        tileTerrain,
        tileFarm,
        terrainType,
        farmType
      );
      const args =
        mode === "plant"
          ? { x: point.x, y: point.y, farm_type_id: farmType.farmTypeId }
          : { x: point.x, y: point.y };

      this.hud.setProgramStatus(
        `${this.describeFarmMode(mode)} ${point.x}, ${point.y}...`
      );
      await this.sendBoltResult(
        await ApplySystem({
          authority: this.wallet.publicKey,
          systemId,
          world: player.worldPda,
          entities,
          extraAccounts,
          args,
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedState = await this.fetchPlayerActionStateOnEr(player);
      const confirmedTile = await this.fetchFarmTileState(
        tileFarm.componentPda,
        point
      );

      this.hud.setProgramStatus(`${this.describeFarmMode(mode)} confirmed.`);
      this.renderActionBusy(confirmedState.activeAction);
      this.emitPlayerActionState(confirmedState);
      await this.syncInventory(player);
      await this.syncFarmTiles(player);
      await this.syncVisiblePlayers();

      return {
        player: confirmedState,
        tile: confirmedTile,
      };
    } catch (error) {
      const message = await describeOnchainError(
        "farm action failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        message ? `Farm action failed: ${message}` : "Farm action failed."
      );
      return null;
    }
  }

  private async performGrabAction(
    point: GridPoint
  ): Promise<FarmActionResult | null> {
    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms([
        "position",
        "activeAction",
        "inventory",
        "playerOwner",
        "initializePlayerOwner",
        "syncPlayerOwner",
        "tileItem",
        "grabTile",
      ]);

      const player = await this.ensureOnchainPlayer();
      const tileItem = await this.createPlayerWorldProvisioner().ensureTileItem(
        player,
        point
      );

      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);

      if (this.isActionActive(actionState.activeAction)) {
        this.hud.setProgramStatus(
          `${this.describeAction(actionState.activeAction)} in progress.`
        );
        this.renderActionBusy(actionState.activeAction);
        this.emitPlayerActionState(actionState);
        return null;
      }

      const itemState = await this.fetchTileItemState(
        tileItem.componentPda,
        point
      );

      if (!itemState || itemState.itemId === 0 || itemState.quantity === 0) {
        this.hud.setProgramStatus("There is no item on that tile.");
        await this.syncTileItems();
        return null;
      }

      const { ApplySystem } = await loadBoltSdk();

      this.hud.setProgramStatus(`Grabbing item at ${point.x}, ${point.y}...`);
      await this.sendBoltResult(
        await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: PROGRAMS.grabTile,
          world: player.worldPda,
          entities: [
            {
              entity: player.entityPda,
              components: [
                { componentId: PROGRAMS.playerOwner },
                { componentId: PROGRAMS.position },
                { componentId: PROGRAMS.activeAction },
              ],
            },
            {
              entity: tileItem.entityPda,
              components: [{ componentId: PROGRAMS.tileItem }],
            },
            {
              entity: player.entityPda,
              components: [{ componentId: PROGRAMS.inventory }],
            },
          ],
          args: point,
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedState = await this.fetchPlayerActionStateOnEr(player);
      const confirmedItem = await this.fetchTileItemState(
        tileItem.componentPda,
        point
      );

      this.hud.setProgramStatus("Grab confirmed.");
      this.renderActionBusy(confirmedState.activeAction);
      this.emitPlayerActionState(confirmedState);
      await this.syncInventory(player);
      await this.syncTileItems();
      await this.syncVisiblePlayers();

      return {
        player: confirmedState,
        item: confirmedItem,
      };
    } catch (error) {
      const message = await describeOnchainError(
        "grab action failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        message ? `Grab failed: ${message}` : "Grab failed."
      );
      return null;
    }
  }

  private async performDropAction(
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ): Promise<FarmActionResult | null> {
    if (!selectedItemId) {
      this.hud.setProgramStatus("Select an inventory item before dropping.");
      return null;
    }

    const quantity = Math.max(1, Math.floor(selectedQuantity ?? 1));

    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms([
        "position",
        "activeAction",
        "inventory",
        "playerOwner",
        "initializePlayerOwner",
        "syncPlayerOwner",
        "tileItem",
        "dropTile",
      ]);

      const player = await this.ensureOnchainPlayer();
      const tileItem = await this.createPlayerWorldProvisioner().ensureTileItem(
        player,
        point,
        { createIfMissing: true }
      );

      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);

      if (this.isActionActive(actionState.activeAction)) {
        this.hud.setProgramStatus(
          `${this.describeAction(actionState.activeAction)} in progress.`
        );
        this.renderActionBusy(actionState.activeAction);
        this.emitPlayerActionState(actionState);
        return null;
      }

      const { ApplySystem } = await loadBoltSdk();

      this.hud.setProgramStatus(
        `Dropping ${quantity} item(s) at ${point.x}, ${point.y}...`
      );
      await this.sendBoltResult(
        await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: PROGRAMS.dropTile,
          world: player.worldPda,
          entities: [
            {
              entity: player.entityPda,
              components: [
                { componentId: PROGRAMS.playerOwner },
                { componentId: PROGRAMS.position },
                { componentId: PROGRAMS.activeAction },
              ],
            },
            {
              entity: tileItem.entityPda,
              components: [{ componentId: PROGRAMS.tileItem }],
            },
            {
              entity: player.entityPda,
              components: [{ componentId: PROGRAMS.inventory }],
            },
          ],
          args: {
            x: point.x,
            y: point.y,
            item_id: selectedItemId,
            quantity,
          },
        }),
        this.erConnection,
        { skipPreflight: true }
      );

      const confirmedState = await this.fetchPlayerActionStateOnEr(player);
      const confirmedItem = await this.fetchTileItemState(
        tileItem.componentPda,
        point
      );

      this.hud.setProgramStatus("Drop confirmed.");
      this.renderActionBusy(confirmedState.activeAction);
      this.emitPlayerActionState(confirmedState);
      await this.syncInventory(player);
      await this.syncTileItems();
      await this.syncVisiblePlayers();

      return {
        player: confirmedState,
        item: confirmedItem,
      };
    } catch (error) {
      const message = await describeOnchainError(
        "drop action failed",
        error,
        this.erConnection
      );
      this.hud.setProgramStatus(
        message ? `Drop failed: ${message}` : "Drop failed."
      );
      return null;
    }
  }

  subscribePlayerActionState(listener: (state: PlayerActionState) => void) {
    this.playerActionStateListeners.add(listener);

    return () => {
      this.playerActionStateListeners.delete(listener);
    };
  }

  subscribePlayerAppearance(listener: (appearance: PlayerAppearance) => void) {
    this.playerAppearanceListeners.add(listener);

    if (this.activePlayerNft) {
      listener(this.getPlayerAppearance(this.activePlayerNft));
    }

    return () => {
      this.playerAppearanceListeners.delete(listener);
    };
  }

  subscribeVisiblePlayers(listener: (players: VisiblePlayerState[]) => void) {
    this.visiblePlayerListeners.add(listener);

    return () => {
      this.visiblePlayerListeners.delete(listener);
    };
  }

  subscribeInventory(listener: (inventory: InventoryState) => void) {
    this.inventoryListeners.add(listener);

    if (this.lastInventoryState) {
      listener(this.lastInventoryState);
    }

    return () => {
      this.inventoryListeners.delete(listener);
    };
  }

  subscribeGoldBalance(listener: (balance: GoldBalanceState) => void) {
    this.goldBalanceListeners.add(listener);
    listener(this.lastGoldBalanceState);
    void this.syncGoldBalance();

    return () => {
      this.goldBalanceListeners.delete(listener);
    };
  }

  subscribeTradeOffers(listener: (offers: TradeOfferState[]) => void) {
    this.tradeOfferListeners.add(listener);
    listener(this.lastTradeOffers);
    this.startTradeOfferSync();
    void this.syncTradeOffers();

    return () => {
      this.tradeOfferListeners.delete(listener);
    };
  }

  async createTradeOffer(args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) {
    let redelegateBuyerPlayerOwner = false;
    let buyer: PlayerState | null = null;

    try {
      buyer = await this.ensureOnchainPlayer();
      const sellerNft = (
        await listPlayerNftsInCollection(this.baseConnection)
      ).find((player) => player.mint.toBase58() === args.sellerMint);

      if (!sellerNft) {
        throw new Error("Selected seller is not visible to this browser.");
      }

      const seller = await this.createPlayerWorldProvisionerFor(
        sellerNft
      ).loadExistingPlayer();

      if (!seller) {
        throw new Error("Selected seller is not initialized on-chain.");
      }

      const offerId =
        BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
      redelegateBuyerPlayerOwner = await this.preparePlayerOwnerForBaseRead(
        buyer,
        "Preparing Player Owner for trade offer..."
      );
      const { offer, instruction } = createTradeOfferInstruction({
        buyer: this.wallet.publicKey,
        seller: sellerNft.owner,
        buyerPlayerOwner: buyer.playerOwnerComponentPda,
        offerId,
        sellerPlayerMint: seller.playerMint,
        buyerEntity: buyer.entityPda,
        sellerEntity: seller.entityPda,
        itemId: args.itemId,
        itemQuantity: args.itemQuantity,
        goldAmount: BigInt(args.goldAmount),
        expiresAt,
      });

      this.hud.setProgramStatus("Creating trade offer...");
      await this.sendBoltResult({ instruction });
      this.hud.setProgramStatus(`Trade offer ${shortAddress(offer)} created.`);
      await this.syncTradeOffers();
    } catch (error) {
      const message = await describeOnchainError(
        "create trade offer failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message ? `Offer failed: ${message}` : "Offer failed."
      );
    } finally {
      if (redelegateBuyerPlayerOwner && buyer) {
        await this.delegatePlayerOwnerAfterBaseRead(
          buyer,
          "Returning Player Owner to ER..."
        );
      }
    }
  }

  async acceptTradeOffer(offerAddress: string) {
    try {
      const player = await this.ensureOnchainPlayer();
      await this.prepareActivePlayerTradeComponentsOnBase(player);
      const offer = new PublicKey(offerAddress);
      const { acceptance, instruction } = acceptTradeOfferInstruction({
        seller: this.wallet.publicKey,
        sellerPlayerOwner: player.playerOwnerComponentPda,
        offer,
      });

      this.hud.setProgramStatus("Accepting trade offer...");
      await this.sendBoltResult({ instruction });
      this.hud.setProgramStatus(
        `Trade accepted. Waiting for buyer to finalize ${shortAddress(
          acceptance
        )}.`
      );
      await this.syncTradeOffers();
    } catch (error) {
      const message = await describeOnchainError(
        "accept trade offer failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message ? `Accept failed: ${message}` : "Accept failed."
      );
    }
  }

  async cancelTradeOffer(offerAddress: string) {
    try {
      const offer = new PublicKey(offerAddress);

      this.hud.setProgramStatus("Cancelling trade offer...");
      await this.sendBoltResult({
        instruction: cancelTradeOfferInstruction({
          buyer: this.wallet.publicKey,
          offer,
        }),
      });
      this.hud.setProgramStatus("Trade offer cancelled.");
      await this.syncTradeOffers();
    } catch (error) {
      const message = await describeOnchainError(
        "cancel trade offer failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message ? `Cancel failed: ${message}` : "Cancel failed."
      );
    }
  }

  async finalizeTradeOffer(offerAddress: string) {
    try {
      const player = await this.ensureOnchainPlayer();
      await this.prepareActivePlayerTradeComponentsOnBase(player);
      const offer =
        this.lastTradeOffers.find(
          (candidate) => candidate.offer === offerAddress
        ) ?? (await this.fetchTradeOfferState(new PublicKey(offerAddress)));

      if (!offer) {
        throw new Error("Trade offer account was not found.");
      }

      const acceptanceAddress =
        offer.acceptance ??
        getTradeAcceptancePda(new PublicKey(offer.offer)).toBase58();
      const acceptance = new PublicKey(acceptanceAddress);
      const buyerPlayerMint = new PublicKey(offer.buyerPlayerMint);
      const sellerPlayerMint = new PublicKey(offer.sellerPlayerMint);
      const sellerEntity = new PublicKey(offer.sellerEntity);
      const sellerPlayerOwner = await this.deriveComponentPda(
        sellerEntity,
        PROGRAMS.playerOwner
      );
      const sellerPosition = await this.deriveComponentPda(
        sellerEntity,
        PROGRAMS.position
      );
      const sellerInventory = await this.deriveComponentPda(
        sellerEntity,
        PROGRAMS.inventory
      );
      const { ApplySystem } = await loadBoltSdk();

      await this.prepareTradeComponentAccountsOnBase([
        {
          account: sellerPlayerOwner,
          programId: PROGRAMS.playerOwner,
          label: "Seller Player Owner",
        },
        {
          account: sellerPosition,
          programId: PROGRAMS.position,
          label: "Seller Position",
        },
        {
          account: sellerInventory,
          programId: PROGRAMS.inventory,
          label: "Seller Inventory",
        },
      ]);
      await Promise.all([
        this.ensurePlayerGoldAccount(buyerPlayerMint),
        this.ensurePlayerGoldAccount(sellerPlayerMint),
      ]);
      await this.installAnchorProvider(this.baseConnection);
      this.hud.setProgramStatus("Finalizing atomic trade...");
      const acceptTrade = await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: PROGRAMS.acceptTrade,
        world: player.worldPda,
        entities: [
          {
            entity: new PublicKey(offer.buyerEntity),
            components: [
              { componentId: PROGRAMS.playerOwner },
              { componentId: PROGRAMS.position },
              { componentId: PROGRAMS.inventory },
            ],
          },
          {
            entity: new PublicKey(offer.sellerEntity),
            components: [
              { componentId: PROGRAMS.playerOwner },
              { componentId: PROGRAMS.position },
              { componentId: PROGRAMS.inventory },
            ],
          },
        ],
        extraAccounts: [
          {
            pubkey: new PublicKey(offer.offer),
            isSigner: false,
            isWritable: false,
          },
          { pubkey: acceptance, isSigner: false, isWritable: false },
          {
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isSigner: false,
            isWritable: false,
          },
        ],
        args: {
          trade_offer: [...new PublicKey(offer.offer).toBytes()],
          trade_acceptance: [...acceptance.toBytes()],
        },
      });
      const transaction = new Transaction();

      if (acceptTrade.transaction) {
        transaction.add(...acceptTrade.transaction.instructions);
      } else if (acceptTrade.instruction) {
        transaction.add(acceptTrade.instruction);
      } else {
        throw new Error("BOLT did not return an accept_trade instruction.");
      }

      transaction.add(
        finalizeTradeOfferInstruction({
          buyer: this.wallet.publicKey,
          offer: new PublicKey(offer.offer),
          acceptance,
          buyerPlayerMint,
          sellerPlayerMint,
          buyerPlayerOwner: player.playerOwnerComponentPda,
          sellerPlayerOwner,
        })
      );

      await this.sendBoltResult({ transaction });
      this.hud.setProgramStatus("Trade finalized.");
      await Promise.all([
        this.syncGoldBalance(),
        this.syncInventory(player),
        this.syncVisiblePlayers(),
        this.syncTradeOffers(),
      ]);
    } catch (error) {
      const message = await describeOnchainError(
        "finalize trade offer failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message ? `Finalize failed: ${message}` : "Finalize failed."
      );
    }
  }

  subscribeFarmTiles(listener: (tiles: FarmTileState[]) => void) {
    this.farmTileListeners.add(listener);

    if (this.lastFarmTileStates.length > 0) {
      listener(this.lastFarmTileStates);
    }

    return () => {
      this.farmTileListeners.delete(listener);
    };
  }

  subscribeTileItems(listener: (items: TileItemState[]) => void) {
    this.tileItemListeners.add(listener);

    if (this.lastTileItemStates.length > 0) {
      listener(this.lastTileItemStates);
    }

    return () => {
      this.tileItemListeners.delete(listener);
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

    this.hud.elements.agentModeToggle?.addEventListener("change", (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      void (enabled ? this.grantAgentSession() : this.revokeAgentSession());
    });

    this.hud.elements.agentDelegateInput?.addEventListener("input", () => {
      const value = this.hud.elements.agentDelegateInput?.value.trim() ?? "";
      if (value) {
        window.localStorage.setItem(AGENT_DELEGATE_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(AGENT_DELEGATE_STORAGE_KEY);
      }
      void this.refreshAgentModeStatus();
    });

    this.hud.elements.agentRevokeButton?.addEventListener("click", () => {
      void this.revokeAgentSession();
    });

    this.hud.elements.mintPlayerButton?.addEventListener("click", () => {
      void this.mintPlayerNft();
    });

    this.hud.elements.playerNftSelect?.addEventListener("change", (event) => {
      const mint = (event.target as HTMLSelectElement).value;

      if (mint) {
        void this.selectPlayerNft(new PublicKey(mint));
      }
    });

    this.hud.elements.resetButton?.addEventListener("click", () => {
      resetBurnerWallet();
      clearStoredPlayer();
      clearActivePlayerNft();
      this.wallet = readBurnerWallet();
      this.playerState = null;
      this.activePlayerNft = null;
      if (this.hud.elements.agentDelegateInput) {
        this.hud.elements.agentDelegateInput.value = "";
      }
      window.localStorage.removeItem(AGENT_DELEGATE_STORAGE_KEY);
      this.lastPlayerActionStateKey = null;
      this.lastInventoryState = null;
      this.lastInventoryStateKey = null;
      this.lastGoldBalanceState = { amount: 0n };
      this.lastTradeOffers = [];
      this.lastTradeOffersKey = null;
      this.lastRelevantTradeOffersKey = null;
      this.lastFarmTileStates = [];
      this.lastFarmTileStateKey = null;
      this.lastTileItemStates = [];
      this.lastTileItemStateKey = null;
      this.knownPlayerTileFarms.clear();
      this.renderActionBusy({
        action: ACTION_IDLE,
        kind: "idle",
        startedAt: 0,
        endsAt: 0,
      });
      this.hud.renderWallet(this.wallet.publicKey);
      void this.refreshPlayerNftHud();
      void this.refreshAgentModeStatus();
      this.emitGoldBalance(this.lastGoldBalanceState);
      this.emitTradeOffers([]);
      this.hud.setProgramStatus("Burner reset. Checking balance...");
      this.startPlayerStateSync();
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

  private async clearStaleLocalPlayersForChainReset() {
    try {
      const genesisHash = await this.baseConnection.getGenesisHash();
      const storedGenesisHash = window.localStorage.getItem(
        CHAIN_GENESIS_STORAGE_KEY
      );

      if (!storedGenesisHash) {
        window.localStorage.setItem(CHAIN_GENESIS_STORAGE_KEY, genesisHash);
        return;
      }

      if (storedGenesisHash === genesisHash) {
        return;
      }

      clearStoredPlayer();
      clearPlayerNfts();
      this.playerState = null;
      this.activePlayerNft = null;
      this.lastPlayerActionStateKey = null;
      this.lastInventoryState = null;
      this.lastInventoryStateKey = null;
      this.lastGoldBalanceState = { amount: 0n };
      this.lastTradeOffers = [];
      this.lastTradeOffersKey = null;
      this.lastRelevantTradeOffersKey = null;
      this.lastFarmTileStates = [];
      this.lastFarmTileStateKey = null;
      this.lastTileItemStates = [];
      this.lastTileItemStateKey = null;
      this.knownPlayerTileFarms.clear();
      this.emitGoldBalance(this.lastGoldBalanceState);
      this.emitTradeOffers([]);
      window.localStorage.setItem(CHAIN_GENESIS_STORAGE_KEY, genesisHash);
      this.hud.setProgramStatus(
        "Localnet reset detected. Cleared stale local players."
      );
    } catch (error) {
      void logOnchainError(
        "localnet reset detection failed",
        error,
        this.baseConnection
      );
    }
  }

  private startPlayerStateSync() {
    if (this.playerStateSyncTimer !== null) {
      window.clearInterval(this.playerStateSyncTimer);
    }

    this.playerStateSyncTimer = window.setInterval(() => {
      void this.syncPlayerState();
    }, PLAYER_STATE_SYNC_INTERVAL_MS);
  }

  private async syncPlayerState(options: { announceLoaded?: boolean } = {}) {
    if (this.playerStateSyncing) {
      return;
    }

    this.playerStateSyncing = true;

    try {
      if (!this.activePlayerNft) {
        return;
      }

      const player =
        this.playerState ??
        (await this.createPlayerWorldProvisioner().loadExistingPlayer());

      if (!player) {
        return;
      }

      this.playerState = player;
      await this.installAnchorProvider(this.erConnection);
      const actionState = await this.fetchPlayerActionStateOnEr(player);
      const stateKey = this.getPlayerActionStateKey(actionState);

      if (stateKey === this.lastPlayerActionStateKey) {
        await this.syncInventory(player);
        await this.syncGoldBalance();
        await this.syncFarmTiles(player);
        await this.syncTileItems();
        await this.syncVisiblePlayers();
        return;
      }

      this.renderActionBusy(actionState.activeAction);
      this.emitPlayerActionState(actionState);
      await this.syncInventory(player);
      await this.syncGoldBalance();
      await this.syncFarmTiles(player);
      await this.syncTileItems();
      await this.syncVisiblePlayers();

      if (options.announceLoaded) {
        this.hud.setProgramStatus(
          `Loaded player at ${actionState.position.x}, ${actionState.position.y}; energy ${actionState.energy.current}/${actionState.energy.max}`
        );
      }
    } catch (error) {
      void logOnchainError(
        "player state sync failed",
        error,
        this.erConnection
      );
    } finally {
      this.playerStateSyncing = false;
    }
  }

  private async syncVisiblePlayers() {
    if (this.visiblePlayerListeners.size === 0) {
      return;
    }

    const visiblePlayers: VisiblePlayerState[] = [];

    for (const playerNft of await listPlayerNftsInCollection(
      this.baseConnection
    )) {
      const isActive =
        this.activePlayerNft?.mint.equals(playerNft.mint) ?? false;

      try {
        const player =
          isActive && this.playerState?.playerMint.equals(playerNft.mint)
            ? this.playerState
            : await this.createPlayerWorldProvisionerFor(
                playerNft
              ).loadExistingPlayer();

        if (!player) {
          continue;
        }

        this.knownPlayerTileFarms.set(
          playerNft.mint.toBase58(),
          player.tileFarms
        );
        const state = await this.fetchPlayerActionStateOnEr(player);
        visiblePlayers.push({
          mint: playerNft.mint.toBase58(),
          owner: playerNft.owner.toBase58(),
          entity: player.entityPda.toBase58(),
          playerOwnerComponent: player.playerOwnerComponentPda.toBase58(),
          positionComponent: player.positionComponentPda.toBase58(),
          inventoryComponent: player.inventoryComponentPda.toBase58(),
          isActive,
          appearance: this.getPlayerAppearance(playerNft),
          state,
        });
      } catch (error) {
        this.knownPlayerTileFarms.delete(playerNft.mint.toBase58());
        console.debug(
          `[Open Wilds] skipped visible player ${shortAddress(playerNft.mint)}`,
          error
        );
      }
    }

    this.emitVisiblePlayers(visiblePlayers);
  }

  private async syncGoldBalance() {
    if (this.goldBalanceListeners.size === 0 && !this.activePlayerNft) {
      return;
    }

    const playerMint = this.activePlayerNft?.mint;

    if (!playerMint) {
      this.emitGoldBalance({ amount: 0n });
      return;
    }

    const goldAccount = getPlayerGoldAccount(playerMint);
    const account = await this.baseConnection.getAccountInfo(goldAccount);

    this.emitGoldBalance({
      amount: account ? decodeTokenAmount(account.data) : 0n,
    });
  }

  private async ensurePlayerGoldAccount(playerMint: PublicKey) {
    const goldAccount = getPlayerGoldAccount(playerMint);
    const account = await this.baseConnection.getAccountInfo(goldAccount);

    if (account) {
      return;
    }

    this.hud.setProgramStatus("Preparing player Gold account...");
    await this.sendBoltResult({
      instruction: createAssociatedTokenAccountIdempotentInstruction(
        this.wallet.publicKey,
        getPlayerGoldAuthorityPda(playerMint),
        getGoldMintPda()
      ),
    });
  }

  private startTradeOfferSync() {
    if (this.tradeOfferSyncTimer !== null) {
      return;
    }

    this.tradeOfferSyncTimer = window.setInterval(() => {
      void this.syncTradeOffers();
    }, TRADE_OFFER_SYNC_INTERVAL_MS);
  }

  private async syncTradeOffers() {
    if (this.tradeOfferListeners.size === 0 || this.tradeOfferSyncing) {
      return;
    }

    const activeMint = this.activePlayerNft?.mint.toBase58();

    if (!activeMint) {
      this.emitTradeOffers([]);
      return;
    }

    this.tradeOfferSyncing = true;

    try {
      const [offers, acceptances] = await Promise.all([
        this.baseConnection.getProgramAccounts(PROGRAMS.openWilds, {
          filters: [{ dataSize: OPEN_WILDS_ACCOUNT_SIZES.tradeOffer }],
        }),
        this.baseConnection.getProgramAccounts(PROGRAMS.openWilds, {
          filters: [{ dataSize: OPEN_WILDS_ACCOUNT_SIZES.tradeAcceptance }],
        }),
      ]);
      const acceptanceByOffer = new Map<string, string>();

      for (const account of acceptances) {
        const decoded = this.decodeTradeAcceptance(account.account.data);

        if (decoded) {
          acceptanceByOffer.set(decoded.offer, account.pubkey.toBase58());
        }
      }

      const relevantOffers = offers
        .map((account) => {
          const decoded = this.decodeTradeOffer(account.account.data);

          if (!decoded) {
            return null;
          }

          const direction =
            decoded.buyerPlayerMint === activeMint
              ? "outgoing"
              : decoded.sellerPlayerMint === activeMint
              ? "incoming"
              : null;

          if (!direction) {
            return null;
          }

          return {
            ...decoded,
            offer: account.pubkey.toBase58(),
            acceptance: acceptanceByOffer.get(account.pubkey.toBase58()),
            direction,
          } satisfies TradeOfferState;
        })
        .filter((offer): offer is TradeOfferState => Boolean(offer))
        .sort((left, right) => Number(right.offerId) - Number(left.offerId));
      const relevantStateKey = this.getTradeOffersStateKey(relevantOffers);

      if (
        relevantStateKey !== this.lastRelevantTradeOffersKey &&
        relevantOffers.some((offer) => offer.status === "finalized")
      ) {
        void this.syncGoldBalance();

        if (this.playerState) {
          void this.syncInventory(this.playerState);
        }
      }

      this.lastRelevantTradeOffersKey = relevantStateKey;

      this.emitTradeOffers(
        relevantOffers.filter((offer) => offer.status !== "finalized")
      );
    } catch (error) {
      void logOnchainError(
        "trade offer sync failed",
        error,
        this.baseConnection
      );
    } finally {
      this.tradeOfferSyncing = false;
    }
  }

  private async fetchTradeOfferState(offer: PublicKey) {
    const account = await this.baseConnection.getAccountInfo(offer);
    const decoded = account ? this.decodeTradeOffer(account.data) : null;

    if (!decoded) {
      return null;
    }

    const acceptance = getTradeAcceptancePda(offer);
    const acceptanceAccount = await this.baseConnection.getAccountInfo(
      acceptance
    );
    const direction =
      decoded.buyerPlayerMint === this.activePlayerNft?.mint.toBase58()
        ? "outgoing"
        : "incoming";

    return {
      ...decoded,
      offer: offer.toBase58(),
      acceptance: acceptanceAccount ? acceptance.toBase58() : undefined,
      direction,
    } satisfies TradeOfferState;
  }

  private async deriveComponentPda(entity: PublicKey, componentId: PublicKey) {
    const { InitializeComponent } = await loadBoltSdk();
    const result = await InitializeComponent({
      payer: this.wallet.publicKey,
      entity,
      componentId,
      authority: this.wallet.publicKey,
    });

    if (!result.componentPda) {
      throw new Error("Component PDA derivation failed.");
    }

    return result.componentPda;
  }

  private async waitForAccountOnEr(account: PublicKey) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await this.erConnection.getAccountInfo(account)) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  private async waitForAccountOwnerOnBase(
    account: PublicKey,
    owner: PublicKey
  ) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const info = await this.baseConnection.getAccountInfo(account);

      if (info?.owner.equals(owner)) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
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

  private async loadGameWorldConfig(): Promise<GameWorldConfig> {
    const response = await fetch("/game-world.localnet.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        "Game world manifest is missing. Run localnet provision."
      );
    }

    return (await response.json()) as GameWorldConfig;
  }

  private findTerrainTypeEntry(config: GameWorldConfig, terrainTypeId: number) {
    const entry = config.terrainTypes.find(
      (terrain) => terrain.terrainTypeId === terrainTypeId
    );

    if (!entry) {
      throw new Error(`Terrain type ${terrainTypeId} is not provisioned.`);
    }

    return {
      entityPda: new PublicKey(entry.entityPda),
      componentPda: new PublicKey(entry.componentPda),
    };
  }

  private async findFarmTypeForAction(
    mode: FarmActionMode,
    selectedItemId: number | null | undefined,
    tileFarmPda: PublicKey,
    config: GameWorldConfig
  ) {
    let farmTypeId =
      mode === "plant"
        ? FARM_TYPES.find((farm) => farm.seedItemId === selectedItemId)
            ?.farmTypeId
        : undefined;

    if (!farmTypeId && mode !== "till") {
      const tile = await this.fetchFarmTileState(tileFarmPda, { x: 0, y: 0 });
      farmTypeId = tile.farmTypeId || FARM_TYPES[0].farmTypeId;
    }

    if (!farmTypeId) {
      farmTypeId = FARM_TYPES[0].farmTypeId;
    }

    if (mode === "plant" && !selectedItemId) {
      throw new Error("Select a seed, sapling, or acorn before planting.");
    }

    const entry = config.farmTypes.find(
      (farmType) => farmType.farmTypeId === farmTypeId
    );

    if (!entry) {
      throw new Error(`Farm type ${farmTypeId} is not provisioned.`);
    }

    return {
      farmTypeId,
      entityPda: new PublicKey(entry.entityPda),
      componentPda: new PublicKey(entry.componentPda),
    };
  }

  private getFarmActionProgram(mode: FarmActionMode) {
    switch (mode) {
      case "till":
        return PROGRAMS.tillTile;
      case "water":
        return PROGRAMS.waterTile;
      case "plant":
        return PROGRAMS.plantTile;
      case "harvest":
        return PROGRAMS.harvestTile;
      case "chop":
        return PROGRAMS.chopTile;
      default:
        return PROGRAMS.movement;
    }
  }

  private getFarmActionAccounts(
    mode: FarmActionMode,
    player: PlayerState,
    tileTerrain: TileTerrainState,
    tileFarm: TileFarmState,
    terrainType: { componentPda: PublicKey },
    farmType: { componentPda: PublicKey }
  ) {
    const playerComponents = [
      { componentId: PROGRAMS.playerOwner },
      { componentId: PROGRAMS.position },
      { componentId: PROGRAMS.energy },
      { componentId: PROGRAMS.activeAction },
    ];

    const entities = [
      {
        entity: player.entityPda,
        components: playerComponents,
      },
    ];

    entities.push({
      entity: tileFarm.entityPda,
      components: [{ componentId: PROGRAMS.tileFarm }],
    });

    if (mode === "plant" || mode === "harvest" || mode === "chop") {
      entities.push({
        entity: player.entityPda,
        components: [{ componentId: PROGRAMS.inventory }],
      });
    }

    const extraAccounts: Array<{
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
    }> = [];

    if (mode === "till" || mode === "plant") {
      extraAccounts.push(
        {
          pubkey: tileTerrain.componentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: terrainType.componentPda,
          isSigner: false,
          isWritable: false,
        }
      );
    }

    if (mode !== "till") {
      extraAccounts.push({
        pubkey: farmType.componentPda,
        isSigner: false,
        isWritable: false,
      });
    }

    return { entities, extraAccounts };
  }

  private async fetchFarmTileState(
    tileFarmPda: PublicKey,
    fallbackPoint: GridPoint
  ): Promise<FarmTileState> {
    const account =
      (await this.erConnection.getAccountInfo(tileFarmPda)) ??
      (await this.baseConnection.getAccountInfo(tileFarmPda));

    if (!account || account.data.byteLength < 67) {
      return {
        ...fallbackPoint,
        soilState: "untilled",
        farmTypeId: 0,
        plantedAt: 0,
        growthSeconds: 0,
        growthUpdatedAt: 0,
        wateredUntil: 0,
        lastHarvestedAt: 0,
        harvestCount: 0,
      };
    }

    const view = new DataView(
      account.data.buffer,
      account.data.byteOffset,
      account.data.byteLength
    );
    const x = this.readI64(view, 8);
    const y = this.readI64(view, 16);
    const farmTypeId = view.getUint16(25, true);

    return {
      x: x || fallbackPoint.x,
      y: y || fallbackPoint.y,
      soilState: view.getUint8(24) === 1 ? "tilled" : "untilled",
      farmTypeId,
      plantedAt: this.readI64(view, 27),
      growthSeconds: view.getUint32(35, true),
      growthUpdatedAt: this.readI64(view, 39),
      wateredUntil: this.readI64(view, 47),
      lastHarvestedAt: this.readI64(view, 55),
      harvestCount: view.getUint32(63, true),
    };
  }

  private async fetchTileItemState(
    tileItemPda: PublicKey,
    fallbackPoint: GridPoint
  ): Promise<TileItemState | null> {
    const account =
      (await this.erConnection.getAccountInfo(tileItemPda)) ??
      (await this.baseConnection.getAccountInfo(tileItemPda));

    if (!account) {
      return null;
    }

    return this.decodeTileItem(account.data, fallbackPoint);
  }

  private describeFarmMode(mode: FarmActionMode) {
    switch (mode) {
      case "till":
        return "Tilling";
      case "water":
        return "Watering";
      case "plant":
        return "Planting";
      case "harvest":
        return "Harvesting";
      case "chop":
        return "Chopping";
      default:
        return "Moving";
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
    const player =
      this.playerState ??
      (this.activePlayerNft
        ? readStoredPlayer(this.wallet.publicKey, this.activePlayerNft.mint)
        : null);

    if (!player) {
      this.hud.setProgramStatus(
        "Create and delegate a player before committing."
      );
      return;
    }

    this.hud.setCommitBusy(true);
    this.hud.setProgramStatus(
      "Committing Position, Energy, and Active Action back to base..."
    );

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
        {
          account: player.activeActionComponentPda,
          programId: PROGRAMS.activeAction,
          label: "Active Action",
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
      player.activeActionDelegated = false;
      this.playerState = player;
      writeStoredPlayer(this.wallet.publicKey, player);
      this.hud.setProgramStatus(
        "Position, Energy, and Active Action committed."
      );
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

  private async prepareActivePlayerTradeComponentsOnBase(player: PlayerState) {
    const components: Array<{
      account: PublicKey;
      programId: PublicKey;
      delegatedKey:
        | "positionDelegated"
        | "inventoryDelegated"
        | "playerOwnerDelegated";
      label: string;
    }> = [
      {
        account: player.playerOwnerComponentPda,
        programId: PROGRAMS.playerOwner,
        delegatedKey: "playerOwnerDelegated",
        label: "Player Owner",
      },
      {
        account: player.positionComponentPda,
        programId: PROGRAMS.position,
        delegatedKey: "positionDelegated",
        label: "Position",
      },
      {
        account: player.inventoryComponentPda,
        programId: PROGRAMS.inventory,
        delegatedKey: "inventoryDelegated",
        label: "Inventory",
      },
    ];

    await this.prepareTradeComponentAccountsOnBase(components);

    for (const component of components) {
      player[component.delegatedKey] = false;
    }

    this.playerState = player;
    writeStoredPlayer(this.wallet.publicKey, player);
  }

  private async prepareTradeComponentAccountsOnBase(
    components: Array<{
      account: PublicKey;
      programId: PublicKey;
      label: string;
    }>
  ) {
    const { createUndelegateInstruction } = await loadBoltSdk();

    await this.installAnchorProvider(this.erConnection);

    for (const component of components) {
      const baseAccount = await this.baseConnection.getAccountInfo(
        component.account
      );

      if (baseAccount?.owner.equals(component.programId)) {
        continue;
      }

      const erAccount = await this.erConnection.getAccountInfo(
        component.account
      );

      if (!erAccount) {
        throw new Error(`${component.label} account is missing.`);
      }

      this.hud.setProgramStatus(`Preparing ${component.label} for trade...`);
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
      await this.waitForAccountOwnerOnBase(
        component.account,
        component.programId
      );
    }
  }

  private async preparePlayerOwnerForBaseRead(
    player: PlayerState,
    status: string
  ) {
    const baseAccount = await this.baseConnection.getAccountInfo(
      player.playerOwnerComponentPda
    );

    if (baseAccount?.owner.equals(PROGRAMS.playerOwner)) {
      player.playerOwnerDelegated = false;
      return false;
    }

    const erAccount = await this.erConnection.getAccountInfo(
      player.playerOwnerComponentPda
    );

    if (!baseAccount && !erAccount) {
      throw new Error("Player Owner account is missing.");
    }

    this.hud.setProgramStatus(status);
    await this.installAnchorProvider(this.erConnection);
    const { createUndelegateInstruction } = await loadBoltSdk();
    await this.sendBoltResult(
      {
        instruction: createUndelegateInstruction({
          payer: this.wallet.publicKey,
          delegatedAccount: player.playerOwnerComponentPda,
          componentPda: PROGRAMS.playerOwner,
        }),
      },
      this.erConnection,
      { skipPreflight: true }
    );

    await this.waitForAccountOwnerOnBase(
      player.playerOwnerComponentPda,
      PROGRAMS.playerOwner
    );
    player.playerOwnerDelegated = false;
    this.playerState = player;
    writeStoredPlayer(this.wallet.publicKey, player);
    return true;
  }

  private async delegatePlayerOwnerAfterBaseRead(
    player: PlayerState,
    status: string
  ) {
    const baseAccount = await this.baseConnection.getAccountInfo(
      player.playerOwnerComponentPda
    );

    if (!baseAccount?.owner.equals(PROGRAMS.playerOwner)) {
      return;
    }

    this.hud.setProgramStatus(status);
    await this.installAnchorProvider(this.baseConnection);
    const { createDelegateInstruction } = await loadBoltSdk();
    await this.sendBoltResult(
      {
        componentPda: player.playerOwnerComponentPda,
        instruction: createDelegateInstruction(
          {
            payer: this.wallet.publicKey,
            entity: player.entityPda,
            account: player.playerOwnerComponentPda,
            ownerProgram: PROGRAMS.playerOwner,
          },
          0,
          new PublicKey(EPHEMERAL_ROLLUP_VALIDATOR),
          PROGRAMS.playerOwner
        ),
      },
      this.baseConnection
    );

    await this.waitForAccountOnEr(player.playerOwnerComponentPda);
    player.playerOwnerDelegated = true;
    this.playerState = player;
    writeStoredPlayer(this.wallet.publicKey, player);
  }

  private async syncActivePlayerOwner(player: PlayerState) {
    if (!this.activePlayerNft?.mint.equals(player.playerMint)) {
      return;
    }

    const ownerState = await this.fetchPlayerOwnerComponent(player);

    if (ownerState?.owner.equals(this.wallet.publicKey)) {
      return;
    }

    const baseAccount = await this.baseConnection.getAccountInfo(
      player.playerOwnerComponentPda
    );

    if (!baseAccount?.owner.equals(PROGRAMS.playerOwner)) {
      this.hud.setProgramStatus(
        "Player NFT is owned by this wallet, but Player Owner is still delegated. Commit it before reclaiming control after a transfer."
      );
      return;
    }

    const { ApplySystem } = await loadBoltSdk();
    await this.installAnchorProvider(this.baseConnection);
    this.hud.setProgramStatus("Syncing player ownership from NFT...");
    await this.sendBoltResult(
      await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: PROGRAMS.syncPlayerOwner,
        world: player.worldPda,
        entities: [
          {
            entity: player.entityPda,
            components: [{ componentId: PROGRAMS.playerOwner }],
          },
        ],
        extraAccounts: [
          {
            pubkey: this.activePlayerNft.tokenAccount,
            isSigner: false,
            isWritable: false,
          },
        ],
        args: {
          player_mint: Array.from(player.playerMint.toBytes()),
          token_account: Array.from(
            this.activePlayerNft.tokenAccount.toBytes()
          ),
        },
      }),
      this.baseConnection
    );

    player.playerOwnerDelegated = false;
    this.playerState = player;
    writeStoredPlayer(this.wallet.publicKey, player);
  }

  private async fetchPlayerOwnerComponent(player: PlayerState) {
    const account =
      (await this.baseConnection.getAccountInfo(
        player.playerOwnerComponentPda
      )) ??
      (await this.erConnection.getAccountInfo(player.playerOwnerComponentPda));

    if (!account || account.data.byteLength < 72) {
      return null;
    }

    return {
      owner: new PublicKey(account.data.slice(8, 40)),
      playerMint: new PublicKey(account.data.slice(40, 72)),
    };
  }

  private async ensureOnchainPlayer() {
    if (!this.activePlayerNft) {
      throw new Error("Mint or select a player NFT before playing.");
    }

    this.playerState = await this.createPlayerWorldProvisioner().ensurePlayer();
    this.startPlayerStateSync();
    await this.syncActivePlayerOwner(this.playerState);
    await this.ensureStarterInventory(this.playerState);
    await this.ensureStarterGold(this.playerState);
    await this.syncInventory(this.playerState);
    return this.playerState;
  }

  private async ensureStarterGold(player: PlayerState) {
    let redelegatePlayerOwner = false;

    try {
      const goldConfig = getGoldConfigPda();
      const configAccount = await this.baseConnection.getAccountInfo(
        goldConfig
      );

      if (!configAccount) {
        this.hud.setProgramStatus("Creating Gold mint...");
        await this.sendBoltResult({
          instruction: initializeGoldConfigInstruction(this.wallet.publicKey),
        });
      }

      const claim = getStarterGoldClaimPda(player.playerMint);
      const claimAccount = await this.baseConnection.getAccountInfo(claim);

      if (!claimAccount) {
        redelegatePlayerOwner = await this.preparePlayerOwnerForBaseRead(
          player,
          "Preparing Player Owner for Gold claim..."
        );
        this.hud.setProgramStatus("Claiming starter Gold...");
        await this.sendBoltResult({
          instruction: claimStarterGoldInstruction(
            this.wallet.publicKey,
            player.playerMint,
            player.playerOwnerComponentPda
          ),
        });
      }
    } catch (error) {
      const message = await describeOnchainError(
        "starter gold failed",
        error,
        this.baseConnection
      );

      if (this.isInstructionFallbackError(message, error)) {
        this.hud.setProgramStatus(
          "Gold is not available on the deployed open_wilds program yet. Redeploy localnet programs to enable Gold."
        );
        await this.syncGoldBalance();
        return;
      }

      throw error;
    } finally {
      if (redelegatePlayerOwner) {
        await this.delegatePlayerOwnerAfterBaseRead(
          player,
          "Returning Player Owner to ER..."
        );
      }
    }

    await this.syncGoldBalance();
  }

  private async ensureStarterInventory(player: PlayerState) {
    const account =
      (await this.erConnection.getAccountInfo(player.inventoryComponentPda)) ??
      (await this.baseConnection.getAccountInfo(player.inventoryComponentPda));

    if (!account || account.data.byteLength < 72) {
      return;
    }

    if (this.decodeInventory(account.data).slots.length > 0) {
      return;
    }

    const useEr = Boolean(
      await this.erConnection.getAccountInfo(player.inventoryComponentPda)
    );
    const connection = useEr ? this.erConnection : this.baseConnection;

    await this.installAnchorProvider(connection);

    const { ApplySystem } = await loadBoltSdk();
    await this.sendBoltResult(
      await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: PROGRAMS.grantStarterInventory,
        world: player.worldPda,
        entities: [
          {
            entity: player.entityPda,
            components: [
              { componentId: PROGRAMS.playerOwner },
              { componentId: PROGRAMS.inventory },
            ],
          },
        ],
        args: STARTER_INVENTORY_ARGS,
      }),
      connection,
      useEr ? { skipPreflight: true } : {}
    );
  }

  private async ensureSelectedPlayerReady() {
    if (!this.activePlayerNft || this.playerState) {
      return;
    }

    try {
      await this.installAnchorProvider(this.baseConnection);
      await this.requireDeployedPrograms([
        "position",
        "energy",
        "activeAction",
        "inventory",
        "playerOwner",
        "initializePlayerOwner",
        "syncPlayerOwner",
        "worldAuthority",
        "initializeWorldAuthority",
        "worldTerrainRegistry",
        "terrainType",
        "tileTerrain",
        "registerTerrainType",
        "defineTerrainType",
        "defineTileTerrain",
        "grantStarterInventory",
      ]);
      await this.ensureOnchainPlayer();
      await this.syncPlayerState({ announceLoaded: true });
    } catch (error) {
      void logOnchainError(
        "selected player provisioning skipped",
        error,
        this.baseConnection
      );
    }
  }

  private createPlayerWorldProvisioner() {
    if (!this.activePlayerNft) {
      throw new Error("Mint or select a player NFT before playing.");
    }

    return this.createPlayerWorldProvisionerFor(this.activePlayerNft);
  }

  private createPlayerWorldProvisionerFor(playerNft: PlayerNft) {
    return new PlayerWorldProvisioner({
      baseConnection: this.baseConnection,
      erConnection: this.erConnection,
      payer: this.wallet.publicKey,
      playerMint: playerNft.mint,
      playerColor: playerNft.color,
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
    const [erPositionAccount, erEnergyAccount, erActiveActionAccount] =
      await this.erConnection.getMultipleAccountsInfo([
        player.positionComponentPda,
        player.energyComponentPda,
        player.activeActionComponentPda,
      ]);
    const [basePositionAccount, baseEnergyAccount, baseActiveActionAccount] =
      !erPositionAccount || !erEnergyAccount || !erActiveActionAccount
        ? await this.baseConnection.getMultipleAccountsInfo([
            player.positionComponentPda,
            player.energyComponentPda,
            player.activeActionComponentPda,
          ])
        : [null, null, null];
    const positionAccount = erPositionAccount ?? basePositionAccount;
    const energyAccount = erEnergyAccount ?? baseEnergyAccount;
    const activeActionAccount =
      erActiveActionAccount ?? baseActiveActionAccount;

    if (!positionAccount || positionAccount.data.byteLength < 24) {
      throw new Error("Position account is missing.");
    }

    if (!energyAccount || energyAccount.data.byteLength < 24) {
      throw new Error("Energy account is missing.");
    }

    if (!activeActionAccount || activeActionAccount.data.byteLength < 25) {
      throw new Error("Active Action account is missing.");
    }

    return {
      position: this.decodePosition(positionAccount.data),
      energy: this.decodeEnergy(energyAccount.data),
      activeAction: this.decodeActiveAction(activeActionAccount.data),
    };
  }

  private async syncInventory(player: PlayerState) {
    if (this.inventoryListeners.size === 0) {
      return;
    }

    const account =
      (await this.erConnection.getAccountInfo(player.inventoryComponentPda)) ??
      (await this.baseConnection.getAccountInfo(player.inventoryComponentPda));

    if (!account || account.data.byteLength < 72) {
      return;
    }

    const inventory = this.decodeInventory(account.data);
    const stateKey = this.getInventoryStateKey(inventory);

    if (stateKey === this.lastInventoryStateKey) {
      return;
    }

    this.emitInventory(inventory);
  }

  private async syncFarmTiles(player: PlayerState) {
    if (this.farmTileListeners.size === 0) {
      return;
    }

    this.knownPlayerTileFarms.set(
      player.playerMint.toBase58(),
      player.tileFarms
    );
    await this.discoverKnownPlayerTileFarms();

    const tileFarmsByAccount = new Map<string, TileFarmState>();

    for (const tileFarms of this.knownPlayerTileFarms.values()) {
      for (const tileFarm of tileFarms) {
        tileFarmsByAccount.set(tileFarm.componentPda.toBase58(), tileFarm);
      }
    }

    if (tileFarmsByAccount.size === 0) {
      if (this.lastFarmTileStateKey !== "") {
        this.emitFarmTiles([]);
      }
      return;
    }

    const tiles = await Promise.all(
      [...tileFarmsByAccount.values()].map((tileFarm) =>
        this.fetchFarmTileState(
          tileFarm.componentPda,
          this.parseTileKey(tileFarm.key)
        )
      )
    );
    const activeTiles = tiles.filter((tile) => this.isFarmTileActive(tile));
    const stateKey = this.getFarmTileStateKey(activeTiles);

    if (stateKey === this.lastFarmTileStateKey) {
      return;
    }

    this.emitFarmTiles(activeTiles);
  }

  private async syncTileItems() {
    if (this.tileItemListeners.size === 0) {
      return;
    }

    const config = await this.loadGameWorldConfig();
    const entries = new Map<
      string,
      { x: number; y: number; componentPda: string }
    >();
    const activeTileItems = this.playerState
      ? await this.createPlayerWorldProvisioner().discoverActiveTileItems(
          this.playerState.worldPda
        )
      : [];

    for (const entry of config.tileItems ?? []) {
      entries.set(getWorldItemKey(entry), entry);
    }

    for (const entry of activeTileItems) {
      const point = this.parseTileKey(entry.key);
      entries.set(entry.key, {
        ...point,
        componentPda: entry.componentPda.toBase58(),
      });
    }

    for (const entry of this.playerState?.tileItems ?? []) {
      const point = this.parseTileKey(entry.key);
      entries.set(entry.key, {
        ...point,
        componentPda: entry.componentPda.toBase58(),
      });
    }

    const items = (
      await Promise.all(
        [...entries.values()].map((entry) =>
          this.fetchTileItemState(new PublicKey(entry.componentPda), entry)
        )
      )
    ).filter((item): item is TileItemState => Boolean(item?.itemId));
    const stateKey = this.getTileItemStateKey(items);

    if (stateKey === this.lastTileItemStateKey) {
      return;
    }

    this.emitTileItems(items);
  }

  private async discoverKnownPlayerTileFarms() {
    for (const playerNft of await listPlayerNftsInCollection(
      this.baseConnection
    )) {
      try {
        const player =
          this.activePlayerNft?.mint.equals(playerNft.mint) &&
          this.playerState?.playerMint.equals(playerNft.mint)
            ? this.playerState
            : await this.createPlayerWorldProvisionerFor(
                playerNft
              ).loadExistingPlayer();

        if (!player) {
          this.knownPlayerTileFarms.delete(playerNft.mint.toBase58());
          continue;
        }

        this.knownPlayerTileFarms.set(
          playerNft.mint.toBase58(),
          player.tileFarms
        );
      } catch (error) {
        this.knownPlayerTileFarms.delete(playerNft.mint.toBase58());
        console.debug(
          `[Open Wilds] skipped farm tiles for ${shortAddress(playerNft.mint)}`,
          error
        );
      }
    }
  }

  private decodeTradeOffer(data: Uint8Array) {
    if (data.byteLength < OPEN_WILDS_ACCOUNT_SIZES.tradeOffer) {
      return null;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      offerId: view.getBigUint64(8, true).toString(),
      buyer: new PublicKey(data.slice(16, 48)).toBase58(),
      seller: new PublicKey(data.slice(48, 80)).toBase58(),
      buyerPlayerMint: new PublicKey(data.slice(80, 112)).toBase58(),
      sellerPlayerMint: new PublicKey(data.slice(112, 144)).toBase58(),
      buyerEntity: new PublicKey(data.slice(144, 176)).toBase58(),
      sellerEntity: new PublicKey(data.slice(176, 208)).toBase58(),
      itemId: view.getUint16(240, true),
      itemQuantity: view.getUint16(242, true),
      goldAmount: view.getBigUint64(244, true),
      expiresAt: Number(view.getBigInt64(252, true)),
      status: this.decodeTradeOfferStatus(view.getUint8(260)),
    };
  }

  private decodeTradeAcceptance(data: Uint8Array) {
    if (data.byteLength < OPEN_WILDS_ACCOUNT_SIZES.tradeAcceptance) {
      return null;
    }

    return {
      offer: new PublicKey(data.slice(8, 40)).toBase58(),
      seller: new PublicKey(data.slice(40, 72)).toBase58(),
    };
  }

  private decodeTradeOfferStatus(value: number): TradeOfferState["status"] {
    switch (value) {
      case 1:
        return "accepted";
      case 2:
        return "finalized";
      default:
        return "open";
    }
  }

  private isInstructionFallbackError(message: string | null, error: unknown) {
    const text = [
      message,
      error instanceof Error ? error.message : null,
      String(error),
    ]
      .filter(Boolean)
      .join("\n");

    return (
      text.includes("InstructionFallbackNotFound") ||
      text.includes("Fallback functions are not supported")
    );
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

  private decodeActiveAction(data: Uint8Array): ActiveActionState {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const action = view.getUint8(8);
    const startedAt = this.readI64(view, 9);
    const endsAt = this.readI64(view, 17);

    return {
      action,
      kind: this.getActionKind(action, endsAt),
      startedAt,
      endsAt,
    };
  }

  private decodeInventory(data: Uint8Array): InventoryState {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const itemIds: number[] = [];
    const quantities: number[] = [];

    for (let index = 0; index < 16; index += 1) {
      itemIds.push(view.getUint16(8 + index * 2, true));
      quantities.push(view.getUint16(40 + index * 2, true));
    }

    return {
      slots: itemIds
        .map((itemId, index) => ({
          itemId,
          quantity: quantities[index],
        }))
        .filter((slot) => slot.itemId !== 0 && slot.quantity > 0),
    };
  }

  private decodeTileItem(
    data: Uint8Array,
    fallbackPoint: GridPoint
  ): TileItemState | null {
    if (data.byteLength < 28) {
      return null;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const itemId = view.getUint16(24, true);
    const quantity = view.getUint16(26, true);

    if (itemId === 0 || quantity === 0) {
      return null;
    }

    return {
      x: this.readI64(view, 8) || fallbackPoint.x,
      y: this.readI64(view, 16) || fallbackPoint.y,
      itemId,
      quantity,
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

  private getActionKind(
    action: number,
    endsAt: number
  ): ActiveActionState["kind"] {
    if (action === ACTION_IDLE || endsAt <= Date.now() / 1000) {
      return "idle";
    }

    if (action === ACTION_MOVE) {
      return "move";
    }

    if (action === ACTION_SLEEP) {
      return "sleep";
    }

    if (FARM_ACTIONS.has(action)) {
      return "farm";
    }

    return "unknown";
  }

  private isActionActive(action: ActiveActionState) {
    return action.endsAt > Date.now() / 1000;
  }

  private describeAction(action: ActiveActionState) {
    if (action.kind === "move") {
      return "Movement";
    }

    if (action.kind === "sleep") {
      return "Sleep";
    }

    if (action.kind === "farm") {
      return "Farming";
    }

    return "Action";
  }

  private renderActionBusy(action: ActiveActionState) {
    if (this.actionUnlockTimer !== null) {
      window.clearTimeout(this.actionUnlockTimer);
      this.actionUnlockTimer = null;
    }

    if (!this.isActionActive(action)) {
      this.hud.setActionBusy(false);
      return;
    }

    this.hud.setActionBusy(true);
    this.actionUnlockTimer = window.setTimeout(() => {
      this.actionUnlockTimer = null;
      this.hud.setActionBusy(false);
    }, Math.max(0, action.endsAt * 1000 - Date.now()));
  }

  private emitPlayerActionState(state: PlayerActionState) {
    this.lastPlayerActionStateKey = this.getPlayerActionStateKey(state);

    for (const listener of this.playerActionStateListeners) {
      listener(state);
    }
  }

  private emitPlayerAppearance(player: PlayerNft) {
    const appearance = this.getPlayerAppearance(player);

    for (const listener of this.playerAppearanceListeners) {
      listener(appearance);
    }
  }

  private emitVisiblePlayers(players: VisiblePlayerState[]) {
    for (const listener of this.visiblePlayerListeners) {
      listener(players);
    }
  }

  private emitInventory(inventory: InventoryState) {
    this.lastInventoryState = inventory;
    this.lastInventoryStateKey = this.getInventoryStateKey(inventory);

    for (const listener of this.inventoryListeners) {
      listener(inventory);
    }
  }

  private emitGoldBalance(balance: GoldBalanceState) {
    this.lastGoldBalanceState = balance;

    for (const listener of this.goldBalanceListeners) {
      listener(balance);
    }
  }

  private emitTradeOffers(offers: TradeOfferState[]) {
    const stateKey = this.getTradeOffersStateKey(offers);

    if (stateKey === this.lastTradeOffersKey) {
      return;
    }

    this.lastTradeOffers = offers;
    this.lastTradeOffersKey = stateKey;

    for (const listener of this.tradeOfferListeners) {
      listener(offers);
    }
  }

  private getTradeOffersStateKey(offers: TradeOfferState[]) {
    return offers
      .map((offer) =>
        [
          offer.offer,
          offer.acceptance ?? "",
          offer.direction,
          offer.status,
          offer.itemId,
          offer.itemQuantity,
          offer.goldAmount.toString(),
          offer.expiresAt,
        ].join(":")
      )
      .join("|");
  }

  private emitFarmTiles(tiles: FarmTileState[]) {
    this.lastFarmTileStates = tiles;
    this.lastFarmTileStateKey = this.getFarmTileStateKey(tiles);

    for (const listener of this.farmTileListeners) {
      listener(tiles);
    }
  }

  private emitTileItems(items: TileItemState[]) {
    this.lastTileItemStates = items;
    this.lastTileItemStateKey = this.getTileItemStateKey(items);

    for (const listener of this.tileItemListeners) {
      listener(items);
    }
  }

  private getPlayerAppearance(player: PlayerNft): PlayerAppearance {
    const style = getPlayerColorStyle(player.color);

    return {
      color: player.color,
      fill: style.fill,
      stroke: style.stroke,
    };
  }

  private async refreshPlayerNftHud() {
    const players = await listOwnedPlayerNfts(
      this.baseConnection,
      this.wallet.publicKey
    );
    this.activePlayerNft = await readActivePlayerNft(
      this.baseConnection,
      this.wallet.publicKey
    );
    this.hud.renderPlayerNfts(players, this.activePlayerNft);

    if (this.activePlayerNft) {
      this.emitPlayerAppearance(this.activePlayerNft);
    }

    await this.refreshAgentModeStatus();
  }

  private restoreAgentModeInput() {
    const input = this.hud.elements.agentDelegateInput;

    if (!input) {
      return;
    }

    input.value = window.localStorage.getItem(AGENT_DELEGATE_STORAGE_KEY) ?? "";
  }

  private parseAgentDelegate(): PublicKey | null {
    const value = this.hud.elements.agentDelegateInput?.value.trim();

    if (!value) {
      return null;
    }

    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  private async refreshAgentModeStatus() {
    const inputValue = this.hud.elements.agentDelegateInput?.value.trim() ?? "";

    if (!this.activePlayerNft) {
      this.hud.setAgentModeState({
        checked: false,
        active: false,
        status: "Select or mint a player first.",
      });
      return;
    }

    if (!inputValue) {
      this.hud.setAgentModeState({
        checked: false,
        active: false,
        status: "Inactive",
      });
      return;
    }

    const delegate = this.parseAgentDelegate();

    if (!delegate) {
      this.hud.setAgentModeState({
        checked: false,
        active: false,
        status: "Invalid OpenClaw key",
      });
      return;
    }

    const session = await this.fetchAgentSession(delegate);
    const isActive =
      Boolean(session) &&
      !session!.revoked &&
      (session!.scopes & PLAYER_SESSION_SCOPES_MOVEMENT_ONLY) ===
        PLAYER_SESSION_SCOPES_MOVEMENT_ONLY;

    this.hud.setAgentModeState({
      checked: isActive,
      active: isActive,
      status: isActive ? "Active: movement + sleep" : "Inactive",
    });
  }

  private async fetchAgentSession(delegate: PublicKey) {
    if (!this.activePlayerNft) {
      return null;
    }

    const account = await this.baseConnection.getAccountInfo(
      getPlayerSessionPda(
        this.activePlayerNft.mint,
        this.wallet.publicKey,
        delegate
      )
    );

    if (!account?.owner.equals(PROGRAMS.openWilds)) {
      return null;
    }

    const session = decodePlayerSession(account.data);

    if (
      !session ||
      !session.playerMint.equals(this.activePlayerNft.mint) ||
      !session.owner.equals(this.wallet.publicKey) ||
      !session.delegate.equals(delegate)
    ) {
      return null;
    }

    return session;
  }

  private async grantAgentSession() {
    const delegate = this.parseAgentDelegate();

    if (!this.activePlayerNft) {
      this.hud.setAgentModeState({
        checked: false,
        active: false,
        status: "Select or mint a player first.",
      });
      return;
    }

    if (!delegate) {
      this.hud.setAgentModeState({
        checked: false,
        active: false,
        status: "Invalid OpenClaw key",
      });
      return;
    }

    try {
      const existing = await this.fetchAgentSession(delegate);
      if (
        existing &&
        !existing.revoked &&
        (existing.scopes & PLAYER_SESSION_SCOPES_MOVEMENT_ONLY) ===
          PLAYER_SESSION_SCOPES_MOVEMENT_ONLY
      ) {
        await this.refreshAgentModeStatus();
        return;
      }

      this.hud.setAgentModeState({
        checked: true,
        active: false,
        busy: true,
        status: "Granting agent access...",
      });
      await this.sendSignedTransaction(
        new Transaction().add(
          grantPlayerSessionInstruction({
            owner: this.wallet.publicKey,
            playerMint: this.activePlayerNft.mint,
            ownerTokenAccount: this.activePlayerNft.tokenAccount,
            delegate,
          })
        ),
        this.baseConnection
      );
      this.hud.setProgramStatus(
        `Agent Mode enabled for ${shortAddress(delegate)}.`
      );
    } catch (error) {
      const message = await describeOnchainError(
        "grant agent session failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message
          ? `Agent Mode grant failed: ${message}`
          : "Agent Mode grant failed."
      );
    } finally {
      await this.refreshAgentModeStatus();
    }
  }

  private async revokeAgentSession() {
    const delegate = this.parseAgentDelegate();

    if (!this.activePlayerNft || !delegate) {
      await this.refreshAgentModeStatus();
      return;
    }

    try {
      const existing = await this.fetchAgentSession(delegate);
      if (!existing) {
        await this.refreshAgentModeStatus();
        return;
      }

      this.hud.setAgentModeState({
        checked: false,
        active: true,
        busy: true,
        status: "Revoking agent access...",
      });
      await this.sendSignedTransaction(
        new Transaction().add(
          revokePlayerSessionInstruction({
            owner: this.wallet.publicKey,
            playerMint: this.activePlayerNft.mint,
            ownerTokenAccount: this.activePlayerNft.tokenAccount,
            delegate,
          })
        ),
        this.baseConnection
      );
      this.hud.setProgramStatus(
        `Agent Mode revoked for ${shortAddress(delegate)}.`
      );
    } catch (error) {
      const message = await describeOnchainError(
        "revoke agent session failed",
        error,
        this.baseConnection
      );
      this.hud.setProgramStatus(
        message
          ? `Agent Mode revoke failed: ${message}`
          : "Agent Mode revoke failed."
      );
    } finally {
      await this.refreshAgentModeStatus();
    }
  }

  private async mintPlayerNft() {
    this.hud.setMintPlayerBusy(true);

    try {
      const color =
        (this.hud.elements.playerColorSelect?.value as PlayerColorId) ?? "rose";
      const { player, transaction, mint } = await mintPlayerNftOnchain(
        this.baseConnection,
        this.wallet.publicKey,
        color
      );

      await this.sendSignedTransaction(transaction, this.baseConnection, [
        mint,
      ]);
      await setActivePlayerNft(
        this.baseConnection,
        this.wallet.publicKey,
        player.mint
      );
      this.playerState = null;
      this.lastPlayerActionStateKey = null;
      this.lastInventoryState = null;
      this.lastInventoryStateKey = null;
      this.lastTradeOffers = [];
      this.lastTradeOffersKey = null;
      this.lastRelevantTradeOffersKey = null;
      this.lastFarmTileStates = [];
      this.lastFarmTileStateKey = null;
      this.lastTileItemStates = [];
      this.lastTileItemStateKey = null;
      this.knownPlayerTileFarms.clear();
      await this.refreshPlayerNftHud();
      this.emitTradeOffers([]);
      this.hud.setProgramStatus(
        `Minted ${player.metadata.name} with ${
          getPlayerColorStyle(color).label
        } metadata.`
      );
      await this.ensureSelectedPlayerReady();
      await this.syncVisiblePlayers();
    } finally {
      this.hud.setMintPlayerBusy(false);
    }
  }

  private async selectPlayerNft(mint: PublicKey) {
    await setActivePlayerNft(this.baseConnection, this.wallet.publicKey, mint);
    clearStoredPlayer();
    this.playerState = null;
    this.lastPlayerActionStateKey = null;
    this.lastInventoryStateKey = null;
    this.lastInventoryState = null;
    this.lastTradeOffers = [];
    this.lastTradeOffersKey = null;
    this.lastRelevantTradeOffersKey = null;
    this.lastFarmTileStateKey = null;
    this.lastFarmTileStates = [];
    this.lastTileItemStateKey = null;
    this.lastTileItemStates = [];
    this.knownPlayerTileFarms.clear();
    await this.refreshPlayerNftHud();
    this.emitTradeOffers([]);
    this.hud.setProgramStatus(`Selected player ${shortAddress(mint)}.`);
    await this.refreshAgentModeStatus();
    void this.ensureSelectedPlayerReady();
    void this.syncVisiblePlayers();
  }

  private getPlayerActionStateKey(state: PlayerActionState) {
    return [
      state.position.x,
      state.position.y,
      state.energy.current,
      state.energy.max,
      state.activeAction.action,
      state.activeAction.kind,
      state.activeAction.startedAt,
      state.activeAction.endsAt,
    ].join(":");
  }

  private getInventoryStateKey(inventory: InventoryState) {
    return inventory.slots
      .map((slot) => `${slot.itemId}:${slot.quantity}`)
      .join("|");
  }

  private getFarmTileStateKey(tiles: FarmTileState[]) {
    return tiles
      .map((tile) =>
        [
          tile.x,
          tile.y,
          tile.soilState,
          tile.farmTypeId,
          tile.plantedAt,
          tile.growthSeconds,
          tile.growthUpdatedAt,
          tile.wateredUntil,
          tile.lastHarvestedAt,
          tile.harvestCount,
        ].join(":")
      )
      .sort()
      .join("|");
  }

  private getTileItemStateKey(items: TileItemState[]) {
    return items
      .map((item) =>
        [getWorldItemKey(item), item.itemId, item.quantity].join(":")
      )
      .sort()
      .join("|");
  }

  private isFarmTileActive(tile: FarmTileState) {
    return (
      tile.soilState === "tilled" ||
      tile.farmTypeId !== 0 ||
      tile.plantedAt !== 0 ||
      tile.growthSeconds !== 0 ||
      tile.growthUpdatedAt !== 0 ||
      tile.lastHarvestedAt !== 0 ||
      tile.harvestCount !== 0 ||
      tile.wateredUntil !== 0
    );
  }

  private parseTileKey(key: string): GridPoint {
    const [x, y] = key.split(",").map(Number);

    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
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

  private async sendSignedTransaction(
    transaction: Transaction,
    connection = this.baseConnection,
    signers: Keypair[] = []
  ) {
    transaction.feePayer ??= this.wallet.publicKey;

    if (!transaction.recentBlockhash) {
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    transaction.partialSign(this.wallet, ...signers);

    return sendAndConfirmRawTransaction(connection, transaction.serialize(), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }

  private async installAnchorProvider(connection: Connection) {
    await installAnchorProvider(
      connection,
      new BrowserAnchorWallet(this.wallet)
    );
  }
}
