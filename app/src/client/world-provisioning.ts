import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  EPHEMERAL_ROLLUP_RPC_URL,
  EPHEMERAL_ROLLUP_VALIDATOR,
  PROGRAMS,
} from "./config";
import { shortAddress } from "./format";
import { loadBoltSdk } from "./sdk";
import {
  clearStoredPlayer,
  readStoredPlayer,
  writeStoredPlayer,
} from "./player-storage";
import { getTileTerrainDefinition, TERRAIN_TYPES } from "../game/terrain";
import type {
  BoltResult,
  PlayerState,
  TileFarmState,
  TileItemComponentState,
  TerrainTypeState,
  TileTerrainState,
} from "./types";
import type { GridPoint } from "../game/types";

type PlayerComponentDefinition = {
  key:
    | "positionComponentPda"
    | "energyComponentPda"
    | "activeActionComponentPda"
    | "inventoryComponentPda";
  delegatedKey:
    | "positionDelegated"
    | "energyDelegated"
    | "activeActionDelegated"
    | "inventoryDelegated";
  label: string;
  programId: PublicKey;
};

type ComponentDelegationDefinition = {
  key?: PlayerComponentDefinition["key"];
  delegatedKey?: PlayerComponentDefinition["delegatedKey"];
  label: string;
  programId: PublicKey;
};

type DelegatedComponentState = {
  entityPda: PublicKey;
  componentPda: PublicKey;
  delegated: boolean;
};

type PlayerWorldProvisionerOptions = {
  baseConnection: Connection;
  erConnection: Connection;
  payer: PublicKey;
  playerMint: PublicKey;
  playerColor: string;
  installBaseProvider: () => Promise<void>;
  sendBoltResult: (
    result: BoltResult,
    connection?: Connection,
    options?: { skipPreflight?: boolean }
  ) => Promise<string>;
  setStatus: (status: string) => void;
};

type GameWorldConfig = {
  worldPda: string;
  worldAuthority?: {
    terrainAdmin: string;
    entityPda: string;
    componentPda: string;
  };
  terrainRegistry: {
    entityPda: string;
    componentPda: string;
  };
  terrainTypes: Array<{
    terrainTypeId: number;
    label: string;
    entityPda: string;
    componentPda: string;
  }>;
  farmTypes?: Array<{
    farmTypeId: number;
    label: string;
    entityPda: string;
    componentPda: string;
  }>;
  tileTerrains?: Array<{
    x: number;
    y: number;
    terrainTypeId: number;
    entityPda: string;
    componentPda: string;
  }>;
  tileItems?: Array<{
    x: number;
    y: number;
    itemId: number;
    quantity: number;
    entityPda: string;
    componentPda: string;
  }>;
};

const GRID_SIZE = 20;
const playerComponents: PlayerComponentDefinition[] = [
  {
    key: "positionComponentPda",
    delegatedKey: "positionDelegated",
    label: "Position",
    programId: PROGRAMS.position,
  },
  {
    key: "energyComponentPda",
    delegatedKey: "energyDelegated",
    label: "Energy",
    programId: PROGRAMS.energy,
  },
  {
    key: "activeActionComponentPda",
    delegatedKey: "activeActionDelegated",
    label: "Active Action",
    programId: PROGRAMS.activeAction,
  },
  {
    key: "inventoryComponentPda",
    delegatedKey: "inventoryDelegated",
    label: "Inventory",
    programId: PROGRAMS.inventory,
  },
  {
    key: "playerOwnerComponentPda",
    delegatedKey: "playerOwnerDelegated",
    label: "Player Owner",
    programId: PROGRAMS.playerOwner,
  },
];

const tileTerrainKey = ({ x, y }: GridPoint) => `${x},${y}`;
const playerEntitySeed = (playerMint: PublicKey) => playerMint.toBytes();
const tileFarmEntitySeed = (playerMint: PublicKey, { x, y }: GridPoint) => {
  const seed = Buffer.alloc(32);
  seed.set(playerMint.toBytes().slice(0, 20), 0);
  seed.write("farm", 20, "utf8");
  seed.writeInt32LE(x, 24);
  seed.writeInt32LE(y, 28);
  return seed;
};
const tileItemEntitySeed = ({ x, y }: GridPoint) => {
  const seed = Buffer.alloc(32);
  seed.write("tile-item", 0, "utf8");
  seed.writeInt32LE(x, 24);
  seed.writeInt32LE(y, 28);
  return seed;
};
const STARTER_INVENTORY_ARGS = {
  turnip_seeds: 6,
  wheat_seeds: 4,
  apple_saplings: 1,
  acorns: 2,
};

const findDelegationRecordPda = (delegatedAccount: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBytes()],
    DELEGATION_PROGRAM_ID
  )[0];

export class PlayerWorldProvisioner {
  constructor(private readonly options: PlayerWorldProvisionerOptions) {}

  /**
   * Ensures the browser wallet has a playable Bolt world graph:
   * registry -> world -> player entity -> position/energy/action components.
   *
   * This is the expansion point for richer world bootstrapping. Add new
   * component definitions to `playerComponents`, or split new entity archetypes
   * into their own provisioner methods as the game grows.
   */
  async ensurePlayer() {
    const storedPlayer = readStoredPlayer(
      this.options.payer,
      this.options.playerMint
    );
    const sharedWorldPda = await this.loadSharedWorldPda();
    const seededPlayer = sharedWorldPda
      ? await this.readSeededPlayer(sharedWorldPda, storedPlayer)
      : null;

    if (seededPlayer) {
      writeStoredPlayer(this.options.payer, seededPlayer);
      return this.ensureComponentsDelegated(seededPlayer);
    }

    if (sharedWorldPda) {
      if (storedPlayer) {
        clearStoredPlayer();
      }

      const player = await this.createPlayerWorldGraph(sharedWorldPda);
      writeStoredPlayer(this.options.payer, player);
      return this.ensureComponentsDelegated(player);
    }

    if (
      storedPlayer &&
      (!sharedWorldPda || storedPlayer.worldPda.equals(sharedWorldPda)) &&
      (await this.hasStoredComponents(storedPlayer))
    ) {
      if (!sharedWorldPda) {
        await this.ensureTerrainTypes(storedPlayer);
      }
      return this.ensureComponentsDelegated(storedPlayer);
    }

    if (storedPlayer) {
      clearStoredPlayer();
    }

    const player = await this.createPlayerWorldGraph(sharedWorldPda);
    writeStoredPlayer(this.options.payer, player);

    if (!sharedWorldPda) {
      await this.ensureTerrainTypes(player);
    }
    return this.ensureComponentsDelegated(player);
  }

  async loadExistingPlayer() {
    const sharedWorldPda = await this.loadSharedWorldPda();
    const storedPlayer = readStoredPlayer(
      this.options.payer,
      this.options.playerMint
    );

    if (sharedWorldPda) {
      const seededPlayer = await this.readSeededPlayer(
        sharedWorldPda,
        storedPlayer
      );

      if (seededPlayer) {
        writeStoredPlayer(this.options.payer, seededPlayer);
      }

      return seededPlayer;
    }

    if (
      storedPlayer &&
      (!sharedWorldPda || storedPlayer.worldPda.equals(sharedWorldPda)) &&
      (await this.hasStoredComponents(storedPlayer))
    ) {
      return storedPlayer;
    }

    return null;
  }

  async ensureTileTerrain(player: PlayerState, point: GridPoint) {
    const key = tileTerrainKey(point);
    const existing = player.tileTerrains.find((tile) => tile.key === key);

    if (existing) {
      await this.ensureComponentDelegated(
        player,
        {
          label: `Tile Terrain ${key}`,
          programId: PROGRAMS.tileTerrain,
        },
        existing
      );
      return existing;
    }

    const sharedTileTerrain = await this.readSharedTileTerrain(point);

    if (sharedTileTerrain) {
      player.tileTerrains.push(sharedTileTerrain);
      writeStoredPlayer(this.options.payer, player);
      await this.ensureComponentDelegated(
        player,
        {
          label: `Tile Terrain ${key}`,
          programId: PROGRAMS.tileTerrain,
        },
        sharedTileTerrain
      );
      writeStoredPlayer(this.options.payer, player);
      return sharedTileTerrain;
    }

    const tileTerrain = await this.createTileTerrain(player, point);
    player.tileTerrains.push(tileTerrain);
    writeStoredPlayer(this.options.payer, player);
    await this.ensureComponentDelegated(
      player,
      {
        label: `Tile Terrain ${key}`,
        programId: PROGRAMS.tileTerrain,
      },
      tileTerrain
    );
    writeStoredPlayer(this.options.payer, player);
    return tileTerrain;
  }

  async ensureTileFarm(player: PlayerState, point: GridPoint) {
    const key = tileTerrainKey(point);
    const existing = player.tileFarms.find((tile) => tile.key === key);

    if (existing) {
      const tileFarm = await this.createTileFarm(player, point);
      if (!existing.componentPda.equals(tileFarm.componentPda)) {
        const existingIndex = player.tileFarms.findIndex(
          (tile) => tile.key === key
        );
        player.tileFarms[existingIndex] = tileFarm;
        writeStoredPlayer(this.options.payer, player);
        await this.ensureComponentDelegated(
          player,
          {
            label: `Tile Farm ${key}`,
            programId: PROGRAMS.tileFarm,
          },
          tileFarm
        );
        writeStoredPlayer(this.options.payer, player);
        return tileFarm;
      }

      await this.ensureComponentDelegated(
        player,
        {
          label: `Tile Farm ${key}`,
          programId: PROGRAMS.tileFarm,
        },
        existing
      );
      return existing;
    }

    const tileFarm = await this.createTileFarm(player, point);
    player.tileFarms.push(tileFarm);
    writeStoredPlayer(this.options.payer, player);
    await this.ensureComponentDelegated(
      player,
      {
        label: `Tile Farm ${key}`,
        programId: PROGRAMS.tileFarm,
      },
      tileFarm
    );
    writeStoredPlayer(this.options.payer, player);
    return tileFarm;
  }

  async ensureTileItem(
    player: PlayerState,
    point: GridPoint,
    options: { createIfMissing?: boolean } = {}
  ) {
    const key = tileTerrainKey(point);
    const existing = player.tileItems.find((tile) => tile.key === key);

    if (existing) {
      await this.ensureComponentDelegated(
        player,
        {
          label: `Tile Item ${key}`,
          programId: PROGRAMS.tileItem,
        },
        existing
      );
      return existing;
    }

    const sharedTileItem = await this.readSharedTileItem(point);

    if (!sharedTileItem && !options.createIfMissing) {
      throw new Error(`No item is provisioned on tile ${key}.`);
    }

    const tileItem =
      sharedTileItem ?? (await this.createTileItem(player, point));
    player.tileItems.push(tileItem);
    writeStoredPlayer(this.options.payer, player);
    await this.ensureComponentDelegated(
      player,
      {
        label: `Tile Item ${key}`,
        programId: PROGRAMS.tileItem,
      },
      tileItem
    );
    writeStoredPlayer(this.options.payer, player);
    return tileItem;
  }

  async discoverActiveTileItems(worldPda: PublicKey) {
    const candidates = await this.deriveTileItemCandidates(worldPda);
    const componentPdas = candidates.map((candidate) => candidate.componentPda);
    const [erAccounts, baseAccounts] = await Promise.all([
      this.getMultipleAccountsInfo(this.options.erConnection, componentPdas),
      this.getMultipleAccountsInfo(this.options.baseConnection, componentPdas),
    ]);

    return candidates.filter((candidate, index) => {
      const account = erAccounts[index] ?? baseAccounts[index];

      return account ? this.isTileItemAccountActive(account.data) : false;
    });
  }

  private async hasStoredComponents(player: PlayerState) {
    const accounts = playerComponents.map((component) => player[component.key]);
    const accountInfos =
      await this.options.baseConnection.getMultipleAccountsInfo(accounts);

    return accountInfos.every(Boolean);
  }

  private async loadSharedWorldPda() {
    try {
      const config = await this.loadGameWorldConfig();
      return new PublicKey(config.worldPda);
    } catch {
      return null;
    }
  }

  private async loadGameWorldConfig() {
    const response = await fetch("/game-world.localnet.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GameWorldConfig;
  }

  private async readSharedTileTerrain(point: GridPoint) {
    const config = await this.loadGameWorldConfig();
    const tile = config?.tileTerrains?.find(
      (candidate) => candidate.x === point.x && candidate.y === point.y
    );

    if (!tile) {
      return null;
    }

    return {
      key: tileTerrainKey(point),
      entityPda: new PublicKey(tile.entityPda),
      componentPda: new PublicKey(tile.componentPda),
      delegated: await this.isComponentDelegated(
        new PublicKey(tile.componentPda)
      ),
    };
  }

  private async readSharedTileItem(point: GridPoint) {
    const config = await this.loadGameWorldConfig();
    const item = config?.tileItems?.find(
      (candidate) => candidate.x === point.x && candidate.y === point.y
    );

    if (!item) {
      return null;
    }

    return {
      key: tileTerrainKey(point),
      entityPda: new PublicKey(item.entityPda),
      componentPda: new PublicKey(item.componentPda),
      delegated: await this.isComponentDelegated(
        new PublicKey(item.componentPda)
      ),
    };
  }

  private async createPlayerWorldGraph(
    sharedWorldPda: PublicKey | null
  ): Promise<PlayerState> {
    this.options.setStatus("Creating on-chain player entity...");
    await this.options.installBaseProvider();

    const {
      AddEntity,
      ApplySystem,
      FindRegistryPda,
      InitializeComponent,
      InitializeNewWorld,
      InitializeRegistry,
    } = await loadBoltSdk();

    let worldPda = sharedWorldPda;

    if (!worldPda) {
      const registryPda = FindRegistryPda({});
      const registryInfo = await this.options.baseConnection.getAccountInfo(
        registryPda
      );

      if (!registryInfo) {
        this.options.setStatus("Creating missing Bolt registry...");
        await this.options.sendBoltResult(
          await InitializeRegistry({
            payer: this.options.payer,
            connection: this.options.baseConnection,
          })
        );
      }

      const worldResult = await InitializeNewWorld({
        payer: this.options.payer,
        connection: this.options.baseConnection,
      });
      await this.options.sendBoltResult(worldResult);

      if (!worldResult.worldPda) {
        throw new Error("World PDA missing after initialization.");
      }

      worldPda = worldResult.worldPda;
    }

    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: worldPda,
      seed: playerEntitySeed(this.options.playerMint),
      connection: this.options.baseConnection,
    });

    if (!entityResult.entityPda) {
      throw new Error("Entity PDA missing after initialization.");
    }

    const entityInfo = await this.options.baseConnection.getAccountInfo(
      entityResult.entityPda
    );

    if (!entityInfo) {
      await this.options.sendBoltResult(entityResult);
    }

    const components = {} as Pick<
      PlayerState,
      | "positionComponentPda"
      | "energyComponentPda"
      | "activeActionComponentPda"
      | "inventoryComponentPda"
      | "playerOwnerComponentPda"
    >;
    let shouldGrantStarterInventory = false;
    let shouldInitializePlayerOwner = false;

    for (const component of playerComponents) {
      const result = await InitializeComponent({
        payer: this.options.payer,
        entity: entityResult.entityPda,
        componentId: component.programId,
        authority: this.options.payer,
      });

      if (!result.componentPda) {
        throw new Error(
          `${component.label} component PDA missing after initialization.`
        );
      }

      const componentInfo = await this.options.baseConnection.getAccountInfo(
        result.componentPda
      );

      if (!componentInfo) {
        await this.options.sendBoltResult(result);
        if (component.programId.equals(PROGRAMS.inventory)) {
          shouldGrantStarterInventory = true;
        }
        if (component.programId.equals(PROGRAMS.playerOwner)) {
          shouldInitializePlayerOwner = true;
        }
      }

      components[component.key] = result.componentPda;
    }

    if (shouldInitializePlayerOwner) {
      await this.initializePlayerOwner(worldPda, entityResult.entityPda);
    }

    if (shouldGrantStarterInventory) {
      await this.options.sendBoltResult(
        await ApplySystem({
          authority: this.options.payer,
          systemId: PROGRAMS.grantStarterInventory,
          world: worldPda,
          entities: [
            {
              entity: entityResult.entityPda,
              components: [
                { componentId: PROGRAMS.playerOwner },
                { componentId: PROGRAMS.inventory },
              ],
            },
          ],
          args: STARTER_INVENTORY_ARGS,
        })
      );
    }

    return {
      playerMint: this.options.playerMint,
      playerColor: this.options.playerColor,
      worldPda,
      entityPda: entityResult.entityPda,
      ...components,
      positionDelegated: false,
      energyDelegated: false,
      activeActionDelegated: false,
      inventoryDelegated: false,
      playerOwnerDelegated: false,
      terrainTypes: [],
      tileTerrains: [],
      tileFarms: [],
      tileItems: [],
    };
  }

  private async readSeededPlayer(
    worldPda: PublicKey,
    storedPlayer: PlayerState | null = null
  ) {
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: worldPda,
      seed: playerEntitySeed(this.options.playerMint),
      connection: this.options.baseConnection,
    });

    if (!entityResult.entityPda) {
      return null;
    }

    const entityInfo = await this.options.baseConnection.getAccountInfo(
      entityResult.entityPda
    );

    if (!entityInfo) {
      return null;
    }

    const components = {} as Pick<
      PlayerState,
      | "positionComponentPda"
      | "energyComponentPda"
      | "activeActionComponentPda"
      | "inventoryComponentPda"
      | "playerOwnerComponentPda"
    >;
    const delegationStates = {} as Pick<
      PlayerState,
      | "positionDelegated"
      | "energyDelegated"
      | "activeActionDelegated"
      | "inventoryDelegated"
      | "playerOwnerDelegated"
    >;

    for (const component of playerComponents) {
      const result = await InitializeComponent({
        payer: this.options.payer,
        entity: entityResult.entityPda,
        componentId: component.programId,
        authority: this.options.payer,
      });

      if (!result.componentPda) {
        return null;
      }

      const [baseAccount, erAccount] = await Promise.all([
        this.options.baseConnection.getAccountInfo(result.componentPda),
        this.options.erConnection.getAccountInfo(result.componentPda),
      ]);

      if (!baseAccount && !erAccount) {
        return null;
      }

      components[component.key] = result.componentPda;
      delegationStates[component.delegatedKey] =
        await this.isComponentDelegated(result.componentPda);
    }

    const preservedState =
      storedPlayer?.worldPda.equals(worldPda) &&
      storedPlayer.playerMint.equals(this.options.playerMint)
        ? storedPlayer
        : null;
    const tileFarms = await this.readExistingTileFarms(
      worldPda,
      preservedState?.tileFarms ?? []
    );

    return {
      playerMint: this.options.playerMint,
      playerColor: this.options.playerColor,
      worldPda,
      entityPda: entityResult.entityPda,
      ...components,
      ...delegationStates,
      terrainTypes: preservedState?.terrainTypes ?? [],
      tileTerrains: preservedState?.tileTerrains ?? [],
      tileFarms,
      tileItems: preservedState?.tileItems ?? [],
    };
  }

  private async initializePlayerOwner(
    worldPda: PublicKey,
    entityPda: PublicKey
  ) {
    const { ApplySystem } = await loadBoltSdk();
    await this.options.sendBoltResult(
      await ApplySystem({
        authority: this.options.payer,
        systemId: PROGRAMS.initializePlayerOwner,
        world: worldPda,
        entities: [
          {
            entity: entityPda,
            components: [{ componentId: PROGRAMS.playerOwner }],
          },
        ],
        args: {
          player_mint: Array.from(this.options.playerMint.toBytes()),
        },
      })
    );
  }

  private async readExistingTileFarms(
    worldPda: PublicKey,
    knownTileFarms: TileFarmState[]
  ) {
    const knownByKey = new Map(
      knownTileFarms.map((tileFarm) => [tileFarm.key, tileFarm])
    );
    const candidates = await this.deriveTileFarmCandidates(worldPda);
    const componentPdas = candidates.map((candidate) => candidate.componentPda);
    const [erAccounts, baseAccounts] = await Promise.all([
      this.getMultipleAccountsInfo(this.options.erConnection, componentPdas),
      this.getMultipleAccountsInfo(this.options.baseConnection, componentPdas),
    ]);
    const tileFarms = new Map<string, TileFarmState>();

    for (const knownTileFarm of knownTileFarms) {
      tileFarms.set(knownTileFarm.key, knownTileFarm);
    }

    candidates.forEach((candidate, index) => {
      const account = erAccounts[index] ?? baseAccounts[index];

      if (!account || !this.isTileFarmAccountActive(account.data)) {
        return;
      }

      tileFarms.set(candidate.key, {
        ...candidate,
        delegated: knownByKey.get(candidate.key)?.delegated ?? false,
      });
    });

    return [...tileFarms.values()];
  }

  private async deriveTileFarmCandidates(worldPda: PublicKey) {
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const candidates: TileFarmState[] = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const point = { x, y };
        const entityResult = await AddEntity({
          payer: this.options.payer,
          world: worldPda,
          seed: tileFarmEntitySeed(this.options.playerMint, point),
          connection: this.options.baseConnection,
        });

        if (!entityResult.entityPda) {
          continue;
        }

        const componentResult = await InitializeComponent({
          payer: this.options.payer,
          entity: entityResult.entityPda,
          componentId: PROGRAMS.tileFarm,
          authority: this.options.payer,
        });

        if (!componentResult.componentPda) {
          continue;
        }

        candidates.push({
          key: tileTerrainKey(point),
          entityPda: entityResult.entityPda,
          componentPda: componentResult.componentPda,
          delegated: false,
        });
      }
    }

    return candidates;
  }

  private async deriveTileItemCandidates(worldPda: PublicKey) {
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const candidates: TileItemComponentState[] = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const point = { x, y };
        const entityResult = await AddEntity({
          payer: this.options.payer,
          world: worldPda,
          seed: tileItemEntitySeed(point),
          connection: this.options.baseConnection,
        });

        if (!entityResult.entityPda) {
          continue;
        }

        const componentResult = await InitializeComponent({
          payer: this.options.payer,
          entity: entityResult.entityPda,
          componentId: PROGRAMS.tileItem,
        });

        if (!componentResult.componentPda) {
          continue;
        }

        candidates.push({
          key: tileTerrainKey(point),
          entityPda: entityResult.entityPda,
          componentPda: componentResult.componentPda,
          delegated: false,
        });
      }
    }

    return candidates;
  }

  private async getMultipleAccountsInfo(
    connection: Connection,
    accounts: PublicKey[]
  ) {
    const accountInfos = [];

    for (let index = 0; index < accounts.length; index += 100) {
      accountInfos.push(
        ...(await connection.getMultipleAccountsInfo(
          accounts.slice(index, index + 100)
        ))
      );
    }

    return accountInfos;
  }

  private isTileFarmAccountActive(data: Uint8Array) {
    if (data.byteLength < 57) {
      return false;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return (
      view.getUint8(24) !== 0 ||
      view.getUint16(25, true) !== 0 ||
      view.getUint32(35, true) !== 0 ||
      this.readI64(view, 47) !== 0
    );
  }

  private isTileItemAccountActive(data: Uint8Array) {
    if (data.byteLength < 28) {
      return false;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return view.getUint16(24, true) !== 0 && view.getUint16(26, true) !== 0;
  }

  private readI64(view: DataView, offset: number) {
    const low = view.getUint32(offset, true);
    const high = view.getInt32(offset + 4, true);

    return high * 0x100000000 + low;
  }

  private async ensureTerrainTypes(player: PlayerState) {
    for (const definition of TERRAIN_TYPES) {
      let terrainType = player.terrainTypes.find(
        (candidate) => candidate.terrainTypeId === definition.terrainTypeId
      );

      if (!terrainType) {
        terrainType = await this.createTerrainType(player, definition);
        player.terrainTypes.push(terrainType);
        writeStoredPlayer(this.options.payer, player);
      }

      await this.ensureComponentDelegated(
        player,
        {
          label: `Terrain Type ${definition.label}`,
          programId: PROGRAMS.terrainType,
        },
        terrainType
      );
    }

    writeStoredPlayer(this.options.payer, player);
  }

  private async createTerrainType(
    player: PlayerState,
    definition: (typeof TERRAIN_TYPES)[number]
  ): Promise<TerrainTypeState> {
    this.options.setStatus(`Creating terrain type ${definition.label}...`);
    await this.options.installBaseProvider();
    const { AddEntity, ApplySystem, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: player.worldPda,
      connection: this.options.baseConnection,
    });
    await this.options.sendBoltResult(entityResult);

    if (!entityResult.entityPda) {
      throw new Error("Terrain type entity PDA missing after initialization.");
    }

    const componentResult = await InitializeComponent({
      payer: this.options.payer,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.terrainType,
    });
    await this.options.sendBoltResult(componentResult);

    if (!componentResult.componentPda) {
      throw new Error(
        "Terrain type component PDA missing after initialization."
      );
    }

    await this.options.sendBoltResult(
      await ApplySystem({
        authority: this.options.payer,
        systemId: PROGRAMS.defineTerrainType,
        world: player.worldPda,
        entities: [
          {
            entity: entityResult.entityPda,
            components: [{ componentId: PROGRAMS.terrainType }],
          },
        ],
        args: {
          terrain_type_id: definition.terrainTypeId,
          feature_flags: definition.featureFlags,
          primary_drop_item_id: definition.primaryDropItemId,
          secondary_drop_item_id: definition.secondaryDropItemId,
          drop_rate_bps: definition.dropRateBps,
        },
      })
    );

    return {
      terrainTypeId: definition.terrainTypeId,
      entityPda: entityResult.entityPda,
      componentPda: componentResult.componentPda,
      delegated: false,
    };
  }

  private async createTileTerrain(
    player: PlayerState,
    point: GridPoint
  ): Promise<TileTerrainState> {
    const definition = getTileTerrainDefinition(point);
    const key = tileTerrainKey(point);
    const worldConfig = await this.loadGameWorldConfig();
    const worldAuthority = worldConfig?.worldAuthority;

    if (!worldAuthority) {
      throw new Error(
        "World authority is missing from the game world manifest."
      );
    }

    this.options.setStatus(`Creating terrain for tile ${key}...`);
    await this.options.installBaseProvider();
    const { AddEntity, ApplySystem, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: player.worldPda,
      connection: this.options.baseConnection,
    });
    await this.options.sendBoltResult(entityResult);

    if (!entityResult.entityPda) {
      throw new Error("Tile terrain entity PDA missing after initialization.");
    }

    const componentResult = await InitializeComponent({
      payer: this.options.payer,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.tileTerrain,
    });
    await this.options.sendBoltResult(componentResult);

    if (!componentResult.componentPda) {
      throw new Error(
        "Tile terrain component PDA missing after initialization."
      );
    }

    await this.options.sendBoltResult(
      await ApplySystem({
        authority: this.options.payer,
        systemId: PROGRAMS.defineTileTerrain,
        world: player.worldPda,
        entities: [
          {
            entity: new PublicKey(worldAuthority.entityPda),
            components: [{ componentId: PROGRAMS.worldAuthority }],
          },
          {
            entity: entityResult.entityPda,
            components: [{ componentId: PROGRAMS.tileTerrain }],
          },
        ],
        args: {
          x: definition.x,
          y: definition.y,
          terrain_type_id: definition.terrainTypeId,
        },
      })
    );

    return {
      key,
      entityPda: entityResult.entityPda,
      componentPda: componentResult.componentPda,
      delegated: false,
    };
  }

  private async createTileFarm(
    player: PlayerState,
    point: GridPoint
  ): Promise<TileFarmState> {
    const key = tileTerrainKey(point);

    this.options.setStatus(`Creating farm state for tile ${key}...`);
    await this.options.installBaseProvider();
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: player.worldPda,
      seed: tileFarmEntitySeed(this.options.playerMint, point),
      connection: this.options.baseConnection,
    });

    if (!entityResult.entityPda) {
      throw new Error("Tile farm entity PDA missing after initialization.");
    }

    const entityInfo = await this.options.baseConnection.getAccountInfo(
      entityResult.entityPda
    );

    if (!entityInfo) {
      await this.options.sendBoltResult(entityResult);
    }

    const componentResult = await InitializeComponent({
      payer: this.options.payer,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.tileFarm,
      authority: this.options.payer,
    });

    if (!componentResult.componentPda) {
      throw new Error("Tile farm component PDA missing after initialization.");
    }

    const [baseComponentInfo, erComponentInfo] = await Promise.all([
      this.options.baseConnection.getAccountInfo(componentResult.componentPda),
      this.options.erConnection.getAccountInfo(componentResult.componentPda),
    ]);

    if (!baseComponentInfo && !erComponentInfo) {
      await this.options.sendBoltResult(componentResult);
    }

    return {
      key,
      entityPda: entityResult.entityPda,
      componentPda: componentResult.componentPda,
      delegated: false,
    };
  }

  private async createTileItem(
    player: PlayerState,
    point: GridPoint
  ): Promise<TileItemComponentState> {
    const key = tileTerrainKey(point);

    this.options.setStatus(`Creating item state for tile ${key}...`);
    await this.options.installBaseProvider();
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: player.worldPda,
      seed: tileItemEntitySeed(point),
      connection: this.options.baseConnection,
    });

    if (!entityResult.entityPda) {
      throw new Error("Tile item entity PDA missing after initialization.");
    }

    const entityInfo = await this.options.baseConnection.getAccountInfo(
      entityResult.entityPda
    );

    if (!entityInfo) {
      await this.options.sendBoltResult(entityResult);
    }

    const componentResult = await InitializeComponent({
      payer: this.options.payer,
      entity: entityResult.entityPda,
      componentId: PROGRAMS.tileItem,
    });

    if (!componentResult.componentPda) {
      throw new Error("Tile item component PDA missing after initialization.");
    }

    const [baseComponentInfo, erComponentInfo] = await Promise.all([
      this.options.baseConnection.getAccountInfo(componentResult.componentPda),
      this.options.erConnection.getAccountInfo(componentResult.componentPda),
    ]);

    if (!baseComponentInfo && !erComponentInfo) {
      await this.options.sendBoltResult(componentResult);
    }

    return {
      key,
      entityPda: entityResult.entityPda,
      componentPda: componentResult.componentPda,
      delegated: false,
    };
  }

  private async ensureComponentsDelegated(player: PlayerState) {
    for (const component of playerComponents) {
      await this.ensureComponentDelegated(player, component);
      player[component.delegatedKey] = true;
    }

    writeStoredPlayer(this.options.payer, player);
    return player;
  }

  private async ensureComponentDelegated(
    player: PlayerState,
    component: ComponentDelegationDefinition,
    componentState?: DelegatedComponentState
  ) {
    if (!componentState && !component.key) {
      throw new Error(`${component.label} component account key is missing.`);
    }

    const account = componentState?.componentPda ?? player[component.key!];
    const entity = componentState?.entityPda ?? player.entityPda;

    if (await this.isComponentDelegated(account)) {
      await this.waitForComponentOnEr(account, component.label);
      if (componentState) {
        componentState.delegated = true;
      }
      writeStoredPlayer(this.options.payer, player);
      return;
    }

    this.options.setStatus(
      `Delegating ${component.label} ${shortAddress(account)} to ER...`
    );
    await this.options.installBaseProvider();

    const { createDelegateInstruction } = await loadBoltSdk();
    const delegateResult = {
      componentPda: account,
      instruction: createDelegateInstruction(
        {
          payer: this.options.payer,
          entity,
          account,
          ownerProgram: component.programId,
        },
        0,
        new PublicKey(EPHEMERAL_ROLLUP_VALIDATOR),
        component.programId
      ),
    };

    await this.options.sendBoltResult(
      delegateResult,
      this.options.baseConnection
    );
    await this.waitForComponentOnEr(account, component.label);
    if (componentState) {
      componentState.delegated = true;
    }
    this.options.setStatus(
      `${component.label} delegated to ER: ${shortAddress(account)}`
    );
  }

  private async isComponentVisibleOnEr(componentAccount: PublicKey) {
    try {
      return Boolean(
        await this.options.erConnection.getAccountInfo(componentAccount)
      );
    } catch {
      return false;
    }
  }

  private async isComponentDelegated(componentAccount: PublicKey) {
    const delegationRecord = findDelegationRecordPda(componentAccount);

    try {
      return Boolean(
        await this.options.baseConnection.getAccountInfo(delegationRecord)
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
}
