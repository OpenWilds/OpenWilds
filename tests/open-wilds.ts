import { PublicKey } from "@solana/web3.js";
import { Position } from "../target/types/position";
import { Energy } from "../target/types/energy";
import { ActiveAction } from "../target/types/active_action";
import { WorldAuthority } from "../target/types/world_authority";
import { WorldTerrainRegistry } from "../target/types/world_terrain_registry";
import { TerrainType } from "../target/types/terrain_type";
import { TileTerrain } from "../target/types/tile_terrain";
import { TileFarm } from "../target/types/tile_farm";
import { FarmType } from "../target/types/farm_type";
import { Inventory } from "../target/types/inventory";
import { Movement } from "../target/types/movement";
import { Sleep } from "../target/types/sleep";
import { RegisterTerrainType } from "../target/types/register_terrain_type";
import { InitializeWorldAuthority } from "../target/types/initialize_world_authority";
import { DefineTileTerrain } from "../target/types/define_tile_terrain";
import { DefineFarmType } from "../target/types/define_farm_type";
import { GrantStarterInventory } from "../target/types/grant_starter_inventory";
import { TillTile } from "../target/types/till_tile";
import { PlantTile } from "../target/types/plant_tile";
import { WaterTile } from "../target/types/water_tile";
import { HarvestTile } from "../target/types/harvest_tile";
import { ChopTile } from "../target/types/chop_tile";
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
  Program,
} from "@magicblock-labs/bolt-sdk";
import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";

describe("open-wilds", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Constants used to test the program.
  let worldPda: PublicKey;
  let entityPda: PublicKey;
  let positionComponentPda: PublicKey;
  let energyComponentPda: PublicKey;
  let activeActionComponentPda: PublicKey;
  let worldAuthorityEntityPda: PublicKey;
  let worldAuthorityComponentPda: PublicKey;
  let terrainRegistryEntityPda: PublicKey;
  let terrainRegistryComponentPda: PublicKey;
  let terrainTypeEntityPda: PublicKey;
  let terrainTypeComponentPda: PublicKey;
  let tileTerrainEntityPda: PublicKey;
  let tileTerrainComponentPda: PublicKey;
  let tileFarmEntityPda: PublicKey;
  let tileFarmComponentPda: PublicKey;
  let farmTypeEntityPda: PublicKey;
  let farmTypeComponentPda: PublicKey;
  let inventoryComponentPda: PublicKey;

  const positionComponent = anchor.workspace.Position as Program<Position>;
  const energyComponent = anchor.workspace.Energy as Program<Energy>;
  const activeActionComponent = anchor.workspace
    .ActiveAction as Program<ActiveAction>;
  const worldAuthorityComponent = anchor.workspace
    .WorldAuthority as Program<WorldAuthority>;
  const terrainRegistryComponent = anchor.workspace
    .WorldTerrainRegistry as Program<WorldTerrainRegistry>;
  const terrainTypeComponent = anchor.workspace
    .TerrainType as Program<TerrainType>;
  const tileTerrainComponent = anchor.workspace
    .TileTerrain as Program<TileTerrain>;
  const tileFarmComponent = anchor.workspace.TileFarm as Program<TileFarm>;
  const farmTypeComponent = anchor.workspace.FarmType as Program<FarmType>;
  const inventoryComponent = anchor.workspace.Inventory as Program<Inventory>;
  const systemMovement = anchor.workspace.Movement as Program<Movement>;
  const systemSleep = anchor.workspace.Sleep as Program<Sleep>;
  const systemTillTile = anchor.workspace.TillTile as Program<TillTile>;
  const systemPlantTile = anchor.workspace.PlantTile as Program<PlantTile>;
  const systemWaterTile = anchor.workspace.WaterTile as Program<WaterTile>;
  const systemHarvestTile = anchor.workspace
    .HarvestTile as Program<HarvestTile>;
  const systemChopTile = anchor.workspace.ChopTile as Program<ChopTile>;
  const systemInitializeWorldAuthority = anchor.workspace
    .InitializeWorldAuthority as Program<InitializeWorldAuthority>;
  const systemRegisterTerrainType = anchor.workspace
    .RegisterTerrainType as Program<RegisterTerrainType>;
  const systemDefineTileTerrain = anchor.workspace
    .DefineTileTerrain as Program<DefineTileTerrain>;
  const systemDefineFarmType = anchor.workspace
    .DefineFarmType as Program<DefineFarmType>;
  const systemGrantStarterInventory = anchor.workspace
    .GrantStarterInventory as Program<GrantStarterInventory>;

  it("InitializeNewWorld", async () => {
    const initNewWorld = await InitializeNewWorld({
      payer: provider.wallet.publicKey,
      connection: provider.connection,
    });
    const txSign = await provider.sendAndConfirm(initNewWorld.transaction);
    worldPda = initNewWorld.worldPda;
    console.log(
      `Initialized a new world (ID=${worldPda}). Initialization signature: ${txSign}`
    );
  });

  it("Add an entity", async () => {
    const addEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    const txSign = await provider.sendAndConfirm(addEntity.transaction);
    entityPda = addEntity.entityPda;
    console.log(
      `Initialized a new Entity (PDA=${entityPda}). Initialization signature: ${txSign}`
    );
  });

  it("Add player components", async () => {
    const initializePosition = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: entityPda,
      componentId: positionComponent.programId,
    });
    const positionTxSign = await provider.sendAndConfirm(
      initializePosition.transaction
    );
    positionComponentPda = initializePosition.componentPda;
    console.log(
      `Initialized the position component. Initialization signature: ${positionTxSign}`
    );

    const initializeEnergy = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: entityPda,
      componentId: energyComponent.programId,
    });
    const energyTxSign = await provider.sendAndConfirm(
      initializeEnergy.transaction
    );
    energyComponentPda = initializeEnergy.componentPda;
    console.log(
      `Initialized the energy component. Initialization signature: ${energyTxSign}`
    );

    const initializeActiveAction = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: entityPda,
      componentId: activeActionComponent.programId,
    });
    const activeActionTxSign = await provider.sendAndConfirm(
      initializeActiveAction.transaction
    );
    activeActionComponentPda = initializeActiveAction.componentPda;
    console.log(
      `Initialized the active action component. Initialization signature: ${activeActionTxSign}`
    );
  });

  it("Defines terrain type and tile terrain components", async () => {
    const addWorldAuthorityEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addWorldAuthorityEntity.transaction);
    worldAuthorityEntityPda = addWorldAuthorityEntity.entityPda;

    const initializeWorldAuthority = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: worldAuthorityEntityPda,
      componentId: worldAuthorityComponent.programId,
    });
    await provider.sendAndConfirm(initializeWorldAuthority.transaction);
    worldAuthorityComponentPda = initializeWorldAuthority.componentPda;

    const setWorldAuthority = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemInitializeWorldAuthority.programId,
      world: worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: worldAuthorityComponent.programId }],
        },
      ],
      args: { terrain_admin: Array.from(provider.wallet.publicKey.toBytes()) },
    });
    await provider.sendAndConfirm(setWorldAuthority.transaction);

    const addTerrainRegistryEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addTerrainRegistryEntity.transaction);
    terrainRegistryEntityPda = addTerrainRegistryEntity.entityPda;

    const initializeTerrainRegistry = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: terrainRegistryEntityPda,
      componentId: terrainRegistryComponent.programId,
    });
    await provider.sendAndConfirm(initializeTerrainRegistry.transaction);
    terrainRegistryComponentPda = initializeTerrainRegistry.componentPda;

    const addTerrainTypeEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addTerrainTypeEntity.transaction);
    terrainTypeEntityPda = addTerrainTypeEntity.entityPda;

    const initializeTerrainType = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: terrainTypeEntityPda,
      componentId: terrainTypeComponent.programId,
    });
    await provider.sendAndConfirm(initializeTerrainType.transaction);
    terrainTypeComponentPda = initializeTerrainType.componentPda;

    const registerTerrainType = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemRegisterTerrainType.programId,
      world: worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: worldAuthorityComponent.programId }],
        },
        {
          entity: terrainRegistryEntityPda,
          components: [{ componentId: terrainRegistryComponent.programId }],
        },
        {
          entity: terrainTypeEntityPda,
          components: [{ componentId: terrainTypeComponent.programId }],
        },
      ],
      args: {
        catalog_version: 1,
        terrain_type_id: 3,
        feature_flags: 1,
        primary_drop_item_id: 3,
        secondary_drop_item_id: 0,
        drop_rate_bps: 8000,
      },
    });
    await provider.sendAndConfirm(registerTerrainType.transaction);

    const addTileTerrainEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addTileTerrainEntity.transaction);
    tileTerrainEntityPda = addTileTerrainEntity.entityPda;

    const initializeTileTerrain = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: tileTerrainEntityPda,
      componentId: tileTerrainComponent.programId,
    });
    await provider.sendAndConfirm(initializeTileTerrain.transaction);
    tileTerrainComponentPda = initializeTileTerrain.componentPda;

    const defineTileTerrain = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemDefineTileTerrain.programId,
      world: worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: worldAuthorityComponent.programId }],
        },
        {
          entity: tileTerrainEntityPda,
          components: [{ componentId: tileTerrainComponent.programId }],
        },
      ],
      args: { x: 2, y: 1, terrain_type_id: 3 },
    });
    await provider.sendAndConfirm(defineTileTerrain.transaction);

    const worldAuthority =
      await worldAuthorityComponent.account.worldAuthority.fetch(
        worldAuthorityComponentPda
      );
    const terrainRegistry =
      await terrainRegistryComponent.account.worldTerrainRegistry.fetch(
        terrainRegistryComponentPda
      );
    const terrainType = await terrainTypeComponent.account.terrainType.fetch(
      terrainTypeComponentPda
    );
    const tileTerrain = await tileTerrainComponent.account.tileTerrain.fetch(
      tileTerrainComponentPda
    );

    expect(worldAuthority.terrainAdmin.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(terrainRegistry.version).to.equal(1);
    expect(terrainRegistry.terrainTypeCount).to.equal(1);
    expect(terrainType.terrainTypeId).to.equal(3);
    expect(terrainType.featureFlags).to.equal(1);
    expect(terrainType.primaryDropItemId).to.equal(3);
    expect(terrainType.dropRateBps).to.equal(8000);
    expect(tileTerrain.x.toNumber()).to.equal(2);
    expect(tileTerrain.y.toNumber()).to.equal(1);
    expect(tileTerrain.terrainTypeId).to.equal(3);
  });

  it("Applies movement as an energy-costed action", async () => {
    // Check that the component has been initialized and x is 0
    const positionBefore = await positionComponent.account.position.fetch(
      positionComponentPda
    );
    const energyBefore = await energyComponent.account.energy.fetch(
      energyComponentPda
    );
    expect(positionBefore.x.toNumber()).to.equal(0);
    expect(positionBefore.y.toNumber()).to.equal(0);
    expect(energyBefore.current.toNumber()).to.equal(0);
    expect(energyBefore.max.toNumber()).to.equal(0);

    // Move the entity to a target cell on the 20x20 grid.
    const target = { x: 1, y: 0 };
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemMovement.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
      ],
      args: target,
    });
    const txSign = await provider.sendAndConfirm(applySystem.transaction);
    console.log(`Applied a system. Signature: ${txSign}`);

    // Check that the system moved to the requested cell.
    const positionAfter = await positionComponent.account.position.fetch(
      positionComponentPda
    );
    const energyAfter = await energyComponent.account.energy.fetch(
      energyComponentPda
    );
    expect(positionAfter.x.toNumber()).to.equal(target.x);
    expect(positionAfter.y.toNumber()).to.equal(target.y);
    expect(energyAfter.current.toNumber()).to.equal(99);
    expect(energyAfter.max.toNumber()).to.equal(100);
  });

  it("Restores energy after sleeping", async () => {
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const sleepSystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemSleep.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
      ],
    });
    const txSign = await provider.sendAndConfirm(sleepSystem.transaction);
    console.log(`Applied sleep system. Signature: ${txSign}`);

    const energyAfter = await energyComponent.account.energy.fetch(
      energyComponentPda
    );
    expect(energyAfter.current.toNumber()).to.equal(100);
    expect(energyAfter.max.toNumber()).to.equal(100);
  });

  it("Tills an adjacent tile using terrain as readonly validation accounts", async () => {
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const addTileFarmEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addTileFarmEntity.transaction);
    tileFarmEntityPda = addTileFarmEntity.entityPda;

    const initializeTileFarm = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: tileFarmEntityPda,
      componentId: tileFarmComponent.programId,
    });
    await provider.sendAndConfirm(initializeTileFarm.transaction);
    tileFarmComponentPda = initializeTileFarm.componentPda;

    const tillTile = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemTillTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: tileTerrainComponentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: terrainTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1 },
    });
    await provider.sendAndConfirm(tillTile.transaction);

    const tileFarm = await tileFarmComponent.account.tileFarm.fetch(
      tileFarmComponentPda
    );
    const energyAfter = await energyComponent.account.energy.fetch(
      energyComponentPda
    );

    expect(tileFarm.x.toNumber()).to.equal(2);
    expect(tileFarm.y.toNumber()).to.equal(1);
    expect(tileFarm.soilState).to.equal(1);
    expect(energyAfter.current.toNumber()).to.equal(98);
  });

  it("Plants and harvests a crop using farm type as a readonly validation account", async () => {
    const initializeInventory = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: entityPda,
      componentId: inventoryComponent.programId,
    });
    await provider.sendAndConfirm(initializeInventory.transaction);
    inventoryComponentPda = initializeInventory.componentPda;

    const grantStarterInventory = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemGrantStarterInventory.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [{ componentId: inventoryComponent.programId }],
        },
      ],
      args: {
        turnip_seeds: 1,
        wheat_seeds: 0,
        apple_saplings: 0,
        acorns: 1,
      },
    });
    await provider.sendAndConfirm(grantStarterInventory.transaction);

    const addFarmTypeEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addFarmTypeEntity.transaction);
    farmTypeEntityPda = addFarmTypeEntity.entityPda;

    const initializeFarmType = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: farmTypeEntityPda,
      componentId: farmTypeComponent.programId,
    });
    await provider.sendAndConfirm(initializeFarmType.transaction);
    farmTypeComponentPda = initializeFarmType.componentPda;

    const defineFarmType = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemDefineFarmType.programId,
      world: worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: worldAuthorityComponent.programId }],
        },
        {
          entity: farmTypeEntityPda,
          components: [{ componentId: farmTypeComponent.programId }],
        },
      ],
      args: {
        farm_type_id: 1,
        farm_kind: 1,
        seed_item_id: 100,
        harvest_item_id: 101,
        required_growth_seconds: 1,
        regrow_seconds: 0,
        base_yield: 2,
        chop_item_id: 0,
        chop_yield: 0,
        stage_count: 2,
        stage_threshold_seconds: [0, 1, 0, 0, 0, 0, 0, 0],
        flags: 1,
      },
    });
    await provider.sendAndConfirm(defineFarmType.transaction);

    await new Promise((resolve) => setTimeout(resolve, 20000));

    const plantTile = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemPlantTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
        {
          entity: entityPda,
          components: [{ componentId: inventoryComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: tileTerrainComponentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: terrainTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: farmTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1, farm_type_id: 1 },
    });
    await provider.sendAndConfirm(plantTile.transaction);

    let tileFarm = await tileFarmComponent.account.tileFarm.fetch(
      tileFarmComponentPda
    );
    let inventory = await inventoryComponent.account.inventory.fetch(
      inventoryComponentPda
    );
    expect(tileFarm.farmTypeId).to.equal(1);
    expect(inventory.itemIds[0]).to.equal(0);
    expect(inventory.quantities[0]).to.equal(0);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const waterTile = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemWaterTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: farmTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1, water_duration_seconds: 60 },
    });
    await provider.sendAndConfirm(waterTile.transaction);

    tileFarm = await tileFarmComponent.account.tileFarm.fetch(
      tileFarmComponentPda
    );
    expect(tileFarm.wateredUntil.toNumber()).to.be.greaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 20000));

    const harvestTile = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemHarvestTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
        {
          entity: entityPda,
          components: [{ componentId: inventoryComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: farmTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1 },
    });
    await provider.sendAndConfirm(harvestTile.transaction);

    tileFarm = await tileFarmComponent.account.tileFarm.fetch(
      tileFarmComponentPda
    );
    inventory = await inventoryComponent.account.inventory.fetch(
      inventoryComponentPda
    );
    const harvestedSlot = inventory.itemIds.findIndex((itemId) => itemId === 101);

    expect(tileFarm.farmTypeId).to.equal(0);
    expect(harvestedSlot).to.be.greaterThanOrEqual(0);
    expect(inventory.quantities[harvestedSlot]).to.equal(2);

    const addTreeFarmTypeEntity = await AddEntity({
      payer: provider.wallet.publicKey,
      world: worldPda,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(addTreeFarmTypeEntity.transaction);
    const treeFarmTypeEntityPda = addTreeFarmTypeEntity.entityPda;

    const initializeTreeFarmType = await InitializeComponent({
      payer: provider.wallet.publicKey,
      entity: treeFarmTypeEntityPda,
      componentId: farmTypeComponent.programId,
    });
    await provider.sendAndConfirm(initializeTreeFarmType.transaction);
    const treeFarmTypeComponentPda = initializeTreeFarmType.componentPda;

    const defineTreeFarmType = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemDefineFarmType.programId,
      world: worldPda,
      entities: [
        {
          entity: worldAuthorityEntityPda,
          components: [{ componentId: worldAuthorityComponent.programId }],
        },
        {
          entity: treeFarmTypeEntityPda,
          components: [{ componentId: farmTypeComponent.programId }],
        },
      ],
      args: {
        farm_type_id: 2,
        farm_kind: 2,
        seed_item_id: 122,
        harvest_item_id: 0,
        required_growth_seconds: 1,
        regrow_seconds: 0,
        base_yield: 0,
        chop_item_id: 130,
        chop_yield: 3,
        stage_count: 2,
        stage_threshold_seconds: [0, 1, 0, 0, 0, 0, 0, 0],
        flags: 1,
      },
    });
    await provider.sendAndConfirm(defineTreeFarmType.transaction);

    await new Promise((resolve) => setTimeout(resolve, 20000));

    const plantTree = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemPlantTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
        {
          entity: entityPda,
          components: [{ componentId: inventoryComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: tileTerrainComponentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: terrainTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: treeFarmTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1, farm_type_id: 2 },
    });
    await provider.sendAndConfirm(plantTree.transaction);

    await new Promise((resolve) => setTimeout(resolve, 20000));

    const chopTile = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemChopTile.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [
            { componentId: positionComponent.programId },
            { componentId: energyComponent.programId },
            { componentId: activeActionComponent.programId },
          ],
        },
        {
          entity: tileFarmEntityPda,
          components: [{ componentId: tileFarmComponent.programId }],
        },
        {
          entity: entityPda,
          components: [{ componentId: inventoryComponent.programId }],
        },
      ],
      extraAccounts: [
        {
          pubkey: treeFarmTypeComponentPda,
          isSigner: false,
          isWritable: false,
        },
      ],
      args: { x: 2, y: 1 },
    });
    await provider.sendAndConfirm(chopTile.transaction);

    tileFarm = await tileFarmComponent.account.tileFarm.fetch(
      tileFarmComponentPda
    );
    inventory = await inventoryComponent.account.inventory.fetch(
      inventoryComponentPda
    );
    const choppedSlot = inventory.itemIds.findIndex((itemId) => itemId === 130);

    expect(tileFarm.farmTypeId).to.equal(0);
    expect(choppedSlot).to.be.greaterThanOrEqual(0);
    expect(inventory.quantities[choppedSlot]).to.equal(3);
  });
});
