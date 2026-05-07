import * as anchor from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import { BrowserAnchorWallet } from "./wallet";
import type { BoltSdk } from "./types";

let boltSdkPromise: Promise<BoltSdk> | null = null;

export const loadBoltSdk = () => {
  boltSdkPromise ??= import("@magicblock-labs/bolt-sdk").then(
    (sdk) => sdk as unknown as BoltSdk
  );

  return boltSdkPromise;
};

export const installAnchorProvider = async (
  connection: Connection,
  wallet: BrowserAnchorWallet
) => {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  anchor.setProvider(provider);
};
