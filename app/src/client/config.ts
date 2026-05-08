import { PublicKey } from "@solana/web3.js";

export const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
export const EPHEMERAL_ROLLUP_RPC_URL =
  import.meta.env.VITE_ER_RPC_URL ?? "http://127.0.0.1:7799";
export const EPHEMERAL_ROLLUP_VALIDATOR =
  import.meta.env.VITE_ER_VALIDATOR ??
  "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";

export const BURNER_STORAGE_KEY = "open-wilds.localnet.burner";
export const PLAYER_STORAGE_KEY = "open-wilds.localnet.player";
export const PLAYER_NFT_STORAGE_KEY = "open-wilds.localnet.player-nfts";
export const ACTIVE_PLAYER_NFT_STORAGE_KEY =
  "open-wilds.localnet.active-player-nft";
export const AIRDROP_SOL = 5;

export const PROGRAMS = {
  openWilds: new PublicKey("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6"),
  position: new PublicKey("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ"),
  energy: new PublicKey("EXfYuzbCqe3VoUrG37gvkhxMmCMBKfvj5DRodsjmG6Pg"),
  activeAction: new PublicKey("g9Y3zHKWC9kJ9CYLQuDkZP7qVwhh6yu2swhxrXn7sVn"),
  inventory: new PublicKey("GkbbrRx8N4XsM6ELpKPQVaSvtU7mpNaKdUYh8X14ddCq"),
  playerOwner: new PublicKey("DRtu8UJRPVQFyVboeX9uzx5qdgsGC9bVyViRCxHSgZwJ"),
  farmType: new PublicKey("AeTFPGveiu5u9qaGpoCFLte95RBbaKYHcPA6VJHGzSJh"),
  tileFarm: new PublicKey("HtQi1ESxw8jY5383gaTwtv8vwJbSKfZcFuRb3vPq86KU"),
  tileItem: new PublicKey("6RLX336UuzR9yU4FCrLcTc1SE62YyPc57L8pqjk3xdwP"),
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
  initializePlayerOwner: new PublicKey(
    "AQfDaprdLStvVNdsn9bNXUH5bwoaWXUbL54ZsJpNm5EV"
  ),
  defineTerrainType: new PublicKey(
    "9HUAZDNqjGrk2jVaQBx95hUFhdkb1vbKq6PDtsoybsLu"
  ),
  defineTileTerrain: new PublicKey(
    "DBfTvysc3GQVoazLgbwLr2yqjs8msjaco9q8fgTaLUTy"
  ),
  defineTileTerrainBatch: new PublicKey(
    "EnjiFX1GJCZXWUAxRFYTbQrDHGdKSi3485EVB5xy2dUa"
  ),
  dropTile: new PublicKey("ENLdCrebMYYvRQFaMCNJAn3DCzEZSJ8JXpwVBFX9R7NH"),
  defineFarmType: new PublicKey("F14xPRR4xx6S8sufyU9MDfdCeCEp6XAFDGTKDfPzfD4y"),
  defineTileItem: new PublicKey("AkakKkvTyQoT9jUeYze5KWG841RcpPfY8XV3Bzk5wn4Z"),
  grantStarterInventory: new PublicKey(
    "DAMdALMLCxCbiMHJovqEvr5c1kvfNdfyN9Nfxs93rhxY"
  ),
  grabTile: new PublicKey("3UEFZZDhmaMh1mBZYvxZxk2PZ2Zb4niHg4wpg2iYiW8J"),
  chopTile: new PublicKey("GctbHkUcDA9AHkDeLtJ1P1sE1oSLoncDGMBYiYPzMAgs"),
  tillTile: new PublicKey("GGf7T4KZ2sJGwiuu6e7bTAc17VwQAR5xKmp9NvF9CmUN"),
  waterTile: new PublicKey("Cp5YRnmvnbRPsCucPAGVh6Sorbd5wjDma8sGKYAuveuu"),
  plantTile: new PublicKey("8g6H4M8cKkieF65YkUDqyJ4AqEFytFUnGEQzrvGc3wkq"),
  harvestTile: new PublicKey("BGdMrM8tY4myjV3iddnPH4mKpZ8LoaABjY1eoyuqfknp"),
};

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
