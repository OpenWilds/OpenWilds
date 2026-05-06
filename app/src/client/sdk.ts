import type { Connection } from "@solana/web3.js";
import { BrowserAnchorWallet } from "./wallet";
import type { BoltSdk } from "./types";

type AnchorSdk = {
  AnchorProvider: new (
    connection: Connection,
    wallet: BrowserAnchorWallet,
    opts: {
      commitment: "confirmed";
      preflightCommitment: "confirmed";
    }
  ) => unknown;
  setProvider: (provider: unknown) => void;
};

let boltSdkPromise: Promise<BoltSdk> | null = null;
let anchorSdkPromise: Promise<AnchorSdk> | null = null;

export const loadBoltSdk = () => {
  boltSdkPromise ??= import("@magicblock-labs/bolt-sdk").then(
    (sdk) => sdk as unknown as BoltSdk
  );

  return boltSdkPromise;
};

const loadAnchorSdk = () => {
  anchorSdkPromise ??= import("@coral-xyz/anchor").then(
    (sdk) => sdk as unknown as AnchorSdk
  );

  return anchorSdkPromise;
};

export const installAnchorProvider = async (
  connection: Connection,
  wallet: BrowserAnchorWallet
) => {
  const { AnchorProvider, setProvider } = await loadAnchorSdk();
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  setProvider(provider);
};

