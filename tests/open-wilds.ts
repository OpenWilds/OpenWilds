import { PublicKey } from "@solana/web3.js";
import { Position } from "../target/types/position";
import { Energy } from "../target/types/energy";
import { Movement } from "../target/types/movement";
import { Sleep } from "../target/types/sleep";
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

  const positionComponent = anchor.workspace.Position as Program<Position>;
  const energyComponent = anchor.workspace.Energy as Program<Energy>;
  const systemMovement = anchor.workspace.Movement as Program<Movement>;
  const systemSleep = anchor.workspace.Sleep as Program<Sleep>;

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

  it("Add position and energy components", async () => {
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
    const target = { x: 12, y: 7 };
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
    expect(energyAfter.current.toNumber()).to.equal(81);
    expect(energyAfter.max.toNumber()).to.equal(100);
  });

  it("Restores energy after sleeping", async () => {
    const sleepSystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: systemSleep.programId,
      world: worldPda,
      entities: [
        {
          entity: entityPda,
          components: [{ componentId: energyComponent.programId }],
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
});
