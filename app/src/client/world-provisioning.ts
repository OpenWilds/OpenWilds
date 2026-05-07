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
  TerrainTypeState,
  TileTerrainState,
} from "./types";
import type { GridPoint } from "../game/types";

type PlayerComponentDefinition = {
  key:
    | "positionComponentPda"
    | "energyComponentPda"
    | "activeActionComponentPda";
  delegatedKey:
    | "positionDelegated"
    | "energyDelegated"
    | "activeActionDelegated";
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
};

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
];

const tileTerrainKey = ({ x, y }: GridPoint) => `${x},${y}`;
const playerEntitySeed = (payer: PublicKey) => payer.toBytes();

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
    const storedPlayer = readStoredPlayer(this.options.payer);
    const sharedWorldPda = await this.loadSharedWorldPda();
    const seededPlayer = sharedWorldPda
      ? await this.readSeededPlayer(sharedWorldPda)
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
    const storedPlayer = readStoredPlayer(this.options.payer);

    if (sharedWorldPda) {
      const seededPlayer = await this.readSeededPlayer(sharedWorldPda);

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

  private async hasStoredComponents(player: PlayerState) {
    const accounts = playerComponents.map((component) => player[component.key]);
    const accountInfos =
      await this.options.baseConnection.getMultipleAccountsInfo(accounts);

    return accountInfos.every(Boolean);
  }

  private async loadSharedWorldPda() {
    try {
      const response = await fetch("/game-world.localnet.json", {
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const config = (await response.json()) as GameWorldConfig;
      return new PublicKey(config.worldPda);
    } catch {
      return null;
    }
  }

  private async createPlayerWorldGraph(
    sharedWorldPda: PublicKey | null
  ): Promise<PlayerState> {
    this.options.setStatus("Creating on-chain player entity...");
    await this.options.installBaseProvider();

    const {
      AddEntity,
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
      seed: playerEntitySeed(this.options.payer),
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
      "positionComponentPda" | "energyComponentPda" | "activeActionComponentPda"
    >;

    for (const component of playerComponents) {
      const result = await InitializeComponent({
        payer: this.options.payer,
        entity: entityResult.entityPda,
        componentId: component.programId,
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
      }

      components[component.key] = result.componentPda;
    }

    return {
      worldPda,
      entityPda: entityResult.entityPda,
      ...components,
      positionDelegated: false,
      energyDelegated: false,
      activeActionDelegated: false,
      terrainTypes: [],
      tileTerrains: [],
    };
  }

  private async readSeededPlayer(worldPda: PublicKey) {
    const { AddEntity, InitializeComponent } = await loadBoltSdk();
    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: worldPda,
      seed: playerEntitySeed(this.options.payer),
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
      "positionComponentPda" | "energyComponentPda" | "activeActionComponentPda"
    >;
    const delegationStates = {} as Pick<
      PlayerState,
      "positionDelegated" | "energyDelegated" | "activeActionDelegated"
    >;

    for (const component of playerComponents) {
      const result = await InitializeComponent({
        payer: this.options.payer,
        entity: entityResult.entityPda,
        componentId: component.programId,
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

    return {
      worldPda,
      entityPda: entityResult.entityPda,
      ...components,
      ...delegationStates,
      terrainTypes: [],
      tileTerrains: [],
    };
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
