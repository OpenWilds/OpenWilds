import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { GridPoint } from "../game/types";

export type StoredTerrainTypeState = {
  terrainTypeId: number;
  entityPda: string;
  componentPda: string;
  delegated?: boolean;
};

export type StoredTileTerrainState = {
  key: string;
  entityPda: string;
  componentPda: string;
  delegated?: boolean;
};

export type StoredPlayerState = {
  wallet: string;
  worldPda: string;
  entityPda: string;
  componentPda?: string;
  positionComponentPda?: string;
  energyComponentPda?: string;
  activeActionComponentPda?: string;
  positionDelegated?: boolean;
  energyDelegated?: boolean;
  activeActionDelegated?: boolean;
  terrainTypes?: StoredTerrainTypeState[];
  tileTerrains?: StoredTileTerrainState[];
};

export type TerrainTypeState = {
  terrainTypeId: number;
  entityPda: PublicKey;
  componentPda: PublicKey;
  delegated: boolean;
};

export type TileTerrainState = {
  key: string;
  entityPda: PublicKey;
  componentPda: PublicKey;
  delegated: boolean;
};

export type PlayerState = {
  worldPda: PublicKey;
  entityPda: PublicKey;
  positionComponentPda: PublicKey;
  energyComponentPda: PublicKey;
  activeActionComponentPda: PublicKey;
  positionDelegated: boolean;
  energyDelegated: boolean;
  activeActionDelegated: boolean;
  terrainTypes: TerrainTypeState[];
  tileTerrains: TileTerrainState[];
};

export type BoltResult = {
  transaction?: Transaction;
  instruction?: TransactionInstruction;
  worldPda?: PublicKey;
  entityPda?: PublicKey;
  componentPda?: PublicKey;
};

export type BoltSdk = {
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
    args?: GridPoint | Record<string, number>;
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
