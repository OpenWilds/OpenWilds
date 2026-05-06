import type { PublicKey } from "@solana/web3.js";

export const shortAddress = (value: PublicKey | string) => {
  const address = value.toString();

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

