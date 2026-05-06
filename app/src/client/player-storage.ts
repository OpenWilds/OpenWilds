import { PublicKey } from "@solana/web3.js";
import { PLAYER_STORAGE_KEY } from "./config";
import type { PlayerState, StoredPlayerState } from "./types";

export const clearStoredPlayer = () => {
  window.localStorage.removeItem(PLAYER_STORAGE_KEY);
};

export const readStoredPlayer = (wallet: PublicKey): PlayerState | null => {
  const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const state = JSON.parse(stored) as StoredPlayerState;

    if (state.wallet !== wallet.toBase58()) {
      return null;
    }

    const positionComponentPda =
      state.positionComponentPda ?? state.componentPda;

    if (!positionComponentPda || !state.energyComponentPda) {
      return null;
    }

    return {
      worldPda: new PublicKey(state.worldPda),
      entityPda: new PublicKey(state.entityPda),
      positionComponentPda: new PublicKey(positionComponentPda),
      energyComponentPda: new PublicKey(state.energyComponentPda),
      positionDelegated: Boolean(state.positionDelegated),
      energyDelegated: Boolean(state.energyDelegated),
    };
  } catch {
    clearStoredPlayer();
    return null;
  }
};

export const writeStoredPlayer = (wallet: PublicKey, state: PlayerState) => {
  const stored: StoredPlayerState = {
    wallet: wallet.toBase58(),
    worldPda: state.worldPda.toBase58(),
    entityPda: state.entityPda.toBase58(),
    positionComponentPda: state.positionComponentPda.toBase58(),
    energyComponentPda: state.energyComponentPda.toBase58(),
    positionDelegated: state.positionDelegated,
    energyDelegated: state.energyDelegated,
  };

  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(stored));
};
