import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { GridPoint } from "../game/types";

export type StoredPlayerState = {
  wallet: string;
  worldPda: string;
  entityPda: string;
  componentPda?: string;
  positionComponentPda?: string;
  energyComponentPda?: string;
  positionDelegated?: boolean;
  energyDelegated?: boolean;
};

export type PlayerState = {
  worldPda: PublicKey;
  entityPda: PublicKey;
  positionComponentPda: PublicKey;
  energyComponentPda: PublicKey;
  positionDelegated: boolean;
  energyDelegated: boolean;
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
