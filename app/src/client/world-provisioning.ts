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
import type { BoltResult, PlayerState } from "./types";

type PlayerComponentDefinition = {
  key: "positionComponentPda" | "energyComponentPda";
  delegatedKey: "positionDelegated" | "energyDelegated";
  label: string;
  programId: PublicKey;
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
];

const findDelegationRecordPda = (delegatedAccount: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBytes()],
    DELEGATION_PROGRAM_ID
  )[0];

export class PlayerWorldProvisioner {
  constructor(private readonly options: PlayerWorldProvisionerOptions) {}

  /**
   * Ensures the browser wallet has a playable Bolt world graph:
   * registry -> world -> player entity -> position/energy components.
   *
   * This is the expansion point for richer world bootstrapping. Add new
   * component definitions to `playerComponents`, or split new entity archetypes
   * into their own provisioner methods as the game grows.
   */
  async ensurePlayer() {
    const storedPlayer = readStoredPlayer(this.options.payer);

    if (storedPlayer && (await this.hasStoredComponents(storedPlayer))) {
      return this.ensureComponentsDelegated(storedPlayer);
    }

    if (storedPlayer) {
      clearStoredPlayer();
    }

    const player = await this.createPlayerWorldGraph();
    writeStoredPlayer(this.options.payer, player);

    return this.ensureComponentsDelegated(player);
  }

  private async hasStoredComponents(player: PlayerState) {
    const accounts = playerComponents.map((component) => player[component.key]);
    const accountInfos =
      await this.options.baseConnection.getMultipleAccountsInfo(accounts);

    return accountInfos.every(Boolean);
  }

  private async createPlayerWorldGraph(): Promise<PlayerState> {
    this.options.setStatus("Creating on-chain player entity...");
    await this.options.installBaseProvider();

    const {
      AddEntity,
      FindRegistryPda,
      InitializeComponent,
      InitializeNewWorld,
      InitializeRegistry,
    } = await loadBoltSdk();

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

    const entityResult = await AddEntity({
      payer: this.options.payer,
      world: worldResult.worldPda,
      connection: this.options.baseConnection,
    });
    await this.options.sendBoltResult(entityResult);

    if (!entityResult.entityPda) {
      throw new Error("Entity PDA missing after initialization.");
    }

    const components = {} as Pick<
      PlayerState,
      "positionComponentPda" | "energyComponentPda"
    >;

    for (const component of playerComponents) {
      const result = await InitializeComponent({
        payer: this.options.payer,
        entity: entityResult.entityPda,
        componentId: component.programId,
      });
      await this.options.sendBoltResult(result);

      if (!result.componentPda) {
        throw new Error(
          `${component.label} component PDA missing after initialization.`
        );
      }

      components[component.key] = result.componentPda;
    }

    return {
      worldPda: worldResult.worldPda,
      entityPda: entityResult.entityPda,
      ...components,
      positionDelegated: false,
      energyDelegated: false,
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
    component: PlayerComponentDefinition
  ) {
    const account = player[component.key];

    if (await this.isComponentDelegated(account)) {
      await this.waitForComponentOnEr(account, component.label);
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
          entity: player.entityPda,
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
