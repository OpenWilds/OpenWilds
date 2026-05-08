import { PublicKey } from "@solana/web3.js";
import { PLAYER_STORAGE_KEY } from "./config";
import type { PlayerState, StoredPlayerState } from "./types";

export const clearStoredPlayer = () => {
  window.localStorage.removeItem(PLAYER_STORAGE_KEY);
};

export const readStoredPlayer = (
  wallet: PublicKey,
  playerMint?: PublicKey
): PlayerState | null => {
  const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const state = JSON.parse(stored) as StoredPlayerState;

    if (state.wallet !== wallet.toBase58()) {
      return null;
    }

    if (playerMint && state.playerMint !== playerMint.toBase58()) {
      return null;
    }

    const positionComponentPda =
      state.positionComponentPda ?? state.componentPda;

    if (
      !positionComponentPda ||
      !state.energyComponentPda ||
      !state.activeActionComponentPda ||
      !state.inventoryComponentPda ||
      !state.playerOwnerComponentPda
    ) {
      return null;
    }

    return {
      playerMint: new PublicKey(state.playerMint ?? wallet.toBase58()),
      playerColor: state.playerColor ?? "rose",
      worldPda: new PublicKey(state.worldPda),
      entityPda: new PublicKey(state.entityPda),
      positionComponentPda: new PublicKey(positionComponentPda),
      energyComponentPda: new PublicKey(state.energyComponentPda),
      activeActionComponentPda: new PublicKey(state.activeActionComponentPda),
      inventoryComponentPda: new PublicKey(state.inventoryComponentPda),
      playerOwnerComponentPda: new PublicKey(state.playerOwnerComponentPda),
      positionDelegated: Boolean(state.positionDelegated),
      energyDelegated: Boolean(state.energyDelegated),
      activeActionDelegated: Boolean(state.activeActionDelegated),
      inventoryDelegated: Boolean(state.inventoryDelegated),
      playerOwnerDelegated: Boolean(state.playerOwnerDelegated),
      terrainTypes: (state.terrainTypes ?? []).map((terrainType) => ({
        terrainTypeId: terrainType.terrainTypeId,
        entityPda: new PublicKey(terrainType.entityPda),
        componentPda: new PublicKey(terrainType.componentPda),
        delegated: Boolean(terrainType.delegated),
      })),
      tileTerrains: (state.tileTerrains ?? []).map((tileTerrain) => ({
        key: tileTerrain.key,
        entityPda: new PublicKey(tileTerrain.entityPda),
        componentPda: new PublicKey(tileTerrain.componentPda),
        delegated: Boolean(tileTerrain.delegated),
      })),
      tileFarms: (state.tileFarms ?? []).map((tileFarm) => ({
        key: tileFarm.key,
        entityPda: new PublicKey(tileFarm.entityPda),
        componentPda: new PublicKey(tileFarm.componentPda),
        delegated: Boolean(tileFarm.delegated),
      })),
      tileItems: (state.tileItems ?? []).map((tileItem) => ({
        key: tileItem.key,
        entityPda: new PublicKey(tileItem.entityPda),
        componentPda: new PublicKey(tileItem.componentPda),
        delegated: Boolean(tileItem.delegated),
      })),
    };
  } catch {
    clearStoredPlayer();
    return null;
  }
};

export const writeStoredPlayer = (wallet: PublicKey, state: PlayerState) => {
  const stored: StoredPlayerState = {
    wallet: wallet.toBase58(),
    playerMint: state.playerMint.toBase58(),
    playerColor: state.playerColor,
    worldPda: state.worldPda.toBase58(),
    entityPda: state.entityPda.toBase58(),
    positionComponentPda: state.positionComponentPda.toBase58(),
    energyComponentPda: state.energyComponentPda.toBase58(),
    activeActionComponentPda: state.activeActionComponentPda.toBase58(),
    inventoryComponentPda: state.inventoryComponentPda.toBase58(),
    playerOwnerComponentPda: state.playerOwnerComponentPda.toBase58(),
    positionDelegated: state.positionDelegated,
    energyDelegated: state.energyDelegated,
    activeActionDelegated: state.activeActionDelegated,
    inventoryDelegated: state.inventoryDelegated,
    playerOwnerDelegated: state.playerOwnerDelegated,
    terrainTypes: state.terrainTypes.map((terrainType) => ({
      terrainTypeId: terrainType.terrainTypeId,
      entityPda: terrainType.entityPda.toBase58(),
      componentPda: terrainType.componentPda.toBase58(),
      delegated: terrainType.delegated,
    })),
    tileTerrains: state.tileTerrains.map((tileTerrain) => ({
      key: tileTerrain.key,
      entityPda: tileTerrain.entityPda.toBase58(),
      componentPda: tileTerrain.componentPda.toBase58(),
      delegated: tileTerrain.delegated,
    })),
    tileFarms: state.tileFarms.map((tileFarm) => ({
      key: tileFarm.key,
      entityPda: tileFarm.entityPda.toBase58(),
      componentPda: tileFarm.componentPda.toBase58(),
      delegated: tileFarm.delegated,
    })),
    tileItems: state.tileItems.map((tileItem) => ({
      key: tileItem.key,
      entityPda: tileItem.entityPda.toBase58(),
      componentPda: tileItem.componentPda.toBase58(),
      delegated: tileItem.delegated,
    })),
  };

  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(stored));
};
