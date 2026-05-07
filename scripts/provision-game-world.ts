import * as anchor from "@coral-xyz/anchor";
import {
  AddEntity,
  ApplySystem,
  FindRegistryPda,
  InitializeComponent,
  InitializeNewWorld,
  InitializeRegistry,
} from "@magicblock-labs/bolt-sdk";
import { PublicKey, Transaction } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  createWorldTerrainDefinition,
  TERRAIN_TYPES,
} from "../app/src/game/terrain";

const LOCALNET_RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
process.env.ANCHOR_PROVIDER_URL ??= LOCALNET_RPC_URL;
process.env.ANCHOR_WALLET ??= `${process.env.HOME}/.config/solana/id.json`;

const GAME_WORLD_CONFIG_PATH = resolve(
  __dirname,
  "../app/public/game-world.localnet.json"
);
const CATALOG_VERSION = 1;
const forceProvision = process.argv.includes("--force");
const provisionTiles = process.argv.includes("--with-tiles");

const PROGRAMS = {
  worldAuthority: new PublicKey("HPVrKGMFzX1VSFkEXU5sf9uZZ5bwqJW1jHkrdFgRGFZg"),
  initializeWorldAuthority: new PublicKey(
    "C4s2BjhFdGsBN5JTQ88FdQQUoqWMuRKWtwYupzSyd5vB"
  ),
  worldTerrainRegistry: new PublicKey(
    "CbYVrUkZDrFRCBFA6HNNrQtzNgXP111zKqKpMy6KyhYQ"
  ),
  terrainType: new PublicKey("G6qkktc5oWkPHFmhk8x3UwzZ5WuQLE5En7PGteko6mhK"),
  tileTerrain: new PublicKey("5hCo8uVeWtjqmeFQAovyLFuW1vZ4wS3kKP7ms7SUyyqk"),
  registerTerrainType: new PublicKey(
    "B9qCeXFe5431no3DTZQdZjexyG1cCep1yHjZrxm5c2AM"
  ),
  defineTileTerrain: new PublicKey(
    "DBfTvysc3GQVoazLgbwLr2yqjs8msjaco9q8fgTaLUTy"
  ),
};

type StoredGameWorld = {
  cluster: "localnet";
  rpcUrl: string;
  catalogVersion: number;
  worldPda: string;
  worldAuthority: {
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
  tileTerrains: Array<{
    x: number;
    y: number;
    terrainTypeId: number;
    entityPda: string;
    componentPda: string;
  }>;
  generatedAt: string;
};

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const connection = provider.connection;

const sendBoltResult = async (
  result: {
    transaction?: Transaction;
    instruction?: anchor.web3.TransactionInstruction;
  },
  label: string
) => {
  const transaction =
    result.transaction ??
    (result.instruction ? new Transaction().add(result.instruction) : null);

  if (!transaction) {
    throw new Error(`${label} did not return a transaction or instruction.`);
  }

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer ??= provider.wallet.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  const signature = await provider.sendAndConfirm(transaction, [], {
    commitment: "confirmed",
  });
  console.log(`${label}: ${signature}`);
  return signature;
};

const requirePrograms = async () => {
  const entries = Object.entries(PROGRAMS);
  const infos = await connection.getMultipleAccountsInfo(
    entries.map(([, programId]) => programId)
  );
  const missing = entries
    .filter(([, _programId], index) => !infos[index]?.executable)
    .map(([name, programId]) => `${name} ${programId.toBase58()}`);

  if (missing.length > 0) {
    throw new Error(
      `Missing deployed terrain program(s): ${missing.join(
        ", "
      )}. Run pnpm localnet:deploy first.`
    );
  }
};

const readExistingWorld = (): StoredGameWorld | null => {
  if (!existsSync(GAME_WORLD_CONFIG_PATH)) {
    return null;
  }

  return JSON.parse(readFileSync(GAME_WORLD_CONFIG_PATH, "utf8"));
};

const hasExistingWorld = async (world: StoredGameWorld) => {
  try {
    return Boolean(
      await connection.getAccountInfo(new PublicKey(world.worldPda))
    );
  } catch {
    return false;
  }
};

const ensureBoltRegistry = async () => {
  const registryPda = FindRegistryPda({});
  const registryInfo = await connection.getAccountInfo(registryPda);

  if (registryInfo) {
    return;
  }

  await sendBoltResult(
    await InitializeRegistry({
      payer: provider.wallet.publicKey,
      connection,
    }),
    "Initialize Bolt registry"
  );
};

const addEntity = async (worldPda: PublicKey, label: string) => {
  const result = await AddEntity({
    payer: provider.wallet.publicKey,
    world: worldPda,
    connection,
  });
  await sendBoltResult(result, `Add ${label} entity`);

  if (!result.entityPda) {
    throw new Error(`${label} entity PDA missing after initialization.`);
  }

  return result.entityPda;
};

const initializeComponent = async (
  entityPda: PublicKey,
  componentId: PublicKey,
  label: string
) => {
  const result = await InitializeComponent({
    payer: provider.wallet.publicKey,
    entity: entityPda,
    componentId,
  });
  await sendBoltResult(result, `Initialize ${label} component`);

  if (!result.componentPda) {
    throw new Error(`${label} component PDA missing after initialization.`);
  }

  return result.componentPda;
};

const main = async () => {
  console.log(`Provisioning Open Wilds game world on ${LOCALNET_RPC_URL}`);
  console.log(`Payer: ${provider.wallet.publicKey.toBase58()}`);

  const existingWorld = readExistingWorld();

  if (
    !forceProvision &&
    existingWorld &&
    (await hasExistingWorld(existingWorld))
  ) {
    console.log(
      `Existing game world found: ${existingWorld.worldPda}. Use --force after resetting localnet.`
    );
    return;
  }

  await requirePrograms();
  await ensureBoltRegistry();

  const worldResult = await InitializeNewWorld({
    payer: provider.wallet.publicKey,
    connection,
  });
  await sendBoltResult(worldResult, "Initialize game world");

  if (!worldResult.worldPda) {
    throw new Error("World PDA missing after initialization.");
  }

  const worldAuthorityEntityPda = await addEntity(
    worldResult.worldPda,
    "world authority"
  );
  const worldAuthorityComponentPda = await initializeComponent(
    worldAuthorityEntityPda,
    PROGRAMS.worldAuthority,
    "world authority"
  );

  await sendBoltResult(
    await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: PROGRAMS.initializeWorldAuthority,
      world: worldResult.worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: PROGRAMS.worldAuthority }],
        },
      ],
      args: {
        terrain_admin: Array.from(provider.wallet.publicKey.toBytes()),
      },
    }),
    "Initialize world authority"
  );

  const terrainRegistryEntityPda = await addEntity(
    worldResult.worldPda,
    "terrain registry"
  );
  const terrainRegistryComponentPda = await initializeComponent(
    terrainRegistryEntityPda,
    PROGRAMS.worldTerrainRegistry,
    "world terrain registry"
  );

  const terrainTypes: StoredGameWorld["terrainTypes"] = [];
  const tileTerrains: StoredGameWorld["tileTerrains"] = [];

  for (const definition of TERRAIN_TYPES) {
    const terrainTypeEntityPda = await addEntity(
      worldResult.worldPda,
      `terrain type ${definition.label}`
    );
    const terrainTypeComponentPda = await initializeComponent(
      terrainTypeEntityPda,
      PROGRAMS.terrainType,
      `terrain type ${definition.label}`
    );

    await sendBoltResult(
      await ApplySystem({
        authority: provider.wallet.publicKey,
        systemId: PROGRAMS.registerTerrainType,
        world: worldResult.worldPda,
        entities: [
          {
            entity: worldAuthorityEntityPda,
            components: [{ componentId: PROGRAMS.worldAuthority }],
          },
          {
            entity: terrainRegistryEntityPda,
            components: [{ componentId: PROGRAMS.worldTerrainRegistry }],
          },
          {
            entity: terrainTypeEntityPda,
            components: [{ componentId: PROGRAMS.terrainType }],
          },
        ],
        args: {
          catalog_version: CATALOG_VERSION,
          terrain_type_id: definition.terrainTypeId,
          feature_flags: definition.featureFlags,
          primary_drop_item_id: definition.primaryDropItemId,
          secondary_drop_item_id: definition.secondaryDropItemId,
          drop_rate_bps: definition.dropRateBps,
        },
      }),
      `Register terrain type ${definition.label}`
    );

    terrainTypes.push({
      terrainTypeId: definition.terrainTypeId,
      label: definition.label,
      entityPda: terrainTypeEntityPda.toBase58(),
      componentPda: terrainTypeComponentPda.toBase58(),
    });
  }

  if (provisionTiles) {
    const tiles = createWorldTerrainDefinition();

    for (const tile of tiles) {
      const tileLabel = `tile terrain ${tile.x},${tile.y}`;
      const tileTerrainEntityPda = await addEntity(
        worldResult.worldPda,
        tileLabel
      );
      const tileTerrainComponentPda = await initializeComponent(
        tileTerrainEntityPda,
        PROGRAMS.tileTerrain,
        tileLabel
      );

      await sendBoltResult(
        await ApplySystem({
          authority: provider.wallet.publicKey,
          systemId: PROGRAMS.defineTileTerrain,
          world: worldResult.worldPda,
          entities: [
            {
              entity: worldAuthorityEntityPda,
              components: [{ componentId: PROGRAMS.worldAuthority }],
            },
            {
              entity: tileTerrainEntityPda,
              components: [{ componentId: PROGRAMS.tileTerrain }],
            },
          ],
          args: {
            x: tile.x,
            y: tile.y,
            terrain_type_id: tile.terrainTypeId,
          },
        }),
        `Define ${tileLabel}`
      );

      tileTerrains.push({
        x: tile.x,
        y: tile.y,
        terrainTypeId: tile.terrainTypeId,
        entityPda: tileTerrainEntityPda.toBase58(),
        componentPda: tileTerrainComponentPda.toBase58(),
      });
    }
  }

  const storedWorld: StoredGameWorld = {
    cluster: "localnet",
    rpcUrl: LOCALNET_RPC_URL,
    catalogVersion: CATALOG_VERSION,
    worldPda: worldResult.worldPda.toBase58(),
    worldAuthority: {
      terrainAdmin: provider.wallet.publicKey.toBase58(),
      entityPda: worldAuthorityEntityPda.toBase58(),
      componentPda: worldAuthorityComponentPda.toBase58(),
    },
    terrainRegistry: {
      entityPda: terrainRegistryEntityPda.toBase58(),
      componentPda: terrainRegistryComponentPda.toBase58(),
    },
    terrainTypes,
    tileTerrains,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(GAME_WORLD_CONFIG_PATH), { recursive: true });
  writeFileSync(
    GAME_WORLD_CONFIG_PATH,
    `${JSON.stringify(storedWorld, null, 2)}\n`
  );

  console.log(`Wrote ${GAME_WORLD_CONFIG_PATH}`);
  console.log(`Game world: ${storedWorld.worldPda}`);
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
