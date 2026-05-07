import { PublicKey } from "@solana/web3.js";

export const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
export const EPHEMERAL_ROLLUP_RPC_URL =
  import.meta.env.VITE_ER_RPC_URL ?? "http://127.0.0.1:7799";
export const EPHEMERAL_ROLLUP_VALIDATOR =
  import.meta.env.VITE_ER_VALIDATOR ??
  "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";

export const BURNER_STORAGE_KEY = "open-wilds.localnet.burner";
export const PLAYER_STORAGE_KEY = "open-wilds.localnet.player";
export const AIRDROP_SOL = 5;

export const PROGRAMS = {
  openWilds: new PublicKey("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6"),
  position: new PublicKey("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ"),
  energy: new PublicKey("EXfYuzbCqe3VoUrG37gvkhxMmCMBKfvj5DRodsjmG6Pg"),
  activeAction: new PublicKey("g9Y3zHKWC9kJ9CYLQuDkZP7qVwhh6yu2swhxrXn7sVn"),
  worldAuthority: new PublicKey("HPVrKGMFzX1VSFkEXU5sf9uZZ5bwqJW1jHkrdFgRGFZg"),
  worldTerrainRegistry: new PublicKey(
    "CbYVrUkZDrFRCBFA6HNNrQtzNgXP111zKqKpMy6KyhYQ"
  ),
  terrainType: new PublicKey("G6qkktc5oWkPHFmhk8x3UwzZ5WuQLE5En7PGteko6mhK"),
  tileTerrain: new PublicKey("5hCo8uVeWtjqmeFQAovyLFuW1vZ4wS3kKP7ms7SUyyqk"),
  movement: new PublicKey("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5"),
  sleep: new PublicKey("AHpcKdhujpiTq8oGbxbCknEfmQQwya6cmvywFL89iZUs"),
  registerTerrainType: new PublicKey(
    "B9qCeXFe5431no3DTZQdZjexyG1cCep1yHjZrxm5c2AM"
  ),
  initializeWorldAuthority: new PublicKey(
    "C4s2BjhFdGsBN5JTQ88FdQQUoqWMuRKWtwYupzSyd5vB"
  ),
  defineTerrainType: new PublicKey(
    "9HUAZDNqjGrk2jVaQBx95hUFhdkb1vbKq6PDtsoybsLu"
  ),
  defineTileTerrain: new PublicKey(
    "DBfTvysc3GQVoazLgbwLr2yqjs8msjaco9q8fgTaLUTy"
  ),
};

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
