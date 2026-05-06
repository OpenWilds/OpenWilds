import { PublicKey } from "@solana/web3.js";

export const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
export const EPHEMERAL_ROLLUP_RPC_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ER_RPC_URL ?? "http://127.0.0.1:7799";
export const EPHEMERAL_ROLLUP_VALIDATOR =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ER_VALIDATOR ?? "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";

export const BURNER_STORAGE_KEY = "open-wilds.localnet.burner";
export const PLAYER_STORAGE_KEY = "open-wilds.localnet.player";
export const AIRDROP_SOL = 5;

export const PROGRAMS = {
  openWilds: new PublicKey("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6"),
  position: new PublicKey("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ"),
  movement: new PublicKey("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5"),
};

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

