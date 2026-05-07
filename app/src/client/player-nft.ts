import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACTIVE_PLAYER_NFT_STORAGE_KEY,
  PLAYER_NFT_STORAGE_KEY,
} from "./config";

export const PLAYER_COLLECTION_ID = "open-wilds-players-localnet";

export const PLAYER_COLORS = [
  { id: "rose", label: "Rose", fill: 0xe24a55, stroke: 0x84242b },
  { id: "sky", label: "Sky", fill: 0x4aa8e2, stroke: 0x245b84 },
  { id: "mint", label: "Mint", fill: 0x45c88a, stroke: 0x24744f },
  { id: "gold", label: "Gold", fill: 0xf3b43f, stroke: 0x875b16 },
  { id: "violet", label: "Violet", fill: 0x9b6ee8, stroke: 0x513282 },
] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number]["id"];

export type PlayerNftMetadata = {
  name: string;
  symbol: string;
  description: string;
  attributes: Array<{ trait_type: string; value: string }>;
  properties: {
    collection: string;
    category: "image";
  };
};

export type StoredPlayerNft = {
  collection: string;
  mint: string;
  owner: string;
  color: PlayerColorId;
  metadata: PlayerNftMetadata;
  mintedAt: number;
};

export type PlayerNft = Omit<StoredPlayerNft, "mint" | "owner"> & {
  mint: PublicKey;
  owner: PublicKey;
};

const readAllStoredPlayerNfts = () => {
  const stored = window.localStorage.getItem(PLAYER_NFT_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const nfts = JSON.parse(stored) as StoredPlayerNft[];
    return nfts.filter((nft) => nft.collection === PLAYER_COLLECTION_ID);
  } catch {
    window.localStorage.removeItem(PLAYER_NFT_STORAGE_KEY);
    return [];
  }
};

const writeAllStoredPlayerNfts = (nfts: StoredPlayerNft[]) => {
  window.localStorage.setItem(PLAYER_NFT_STORAGE_KEY, JSON.stringify(nfts));
};

const hydratePlayerNft = (nft: StoredPlayerNft): PlayerNft => ({
  ...nft,
  mint: new PublicKey(nft.mint),
  owner: new PublicKey(nft.owner),
});

const getColor = (color: string) =>
  PLAYER_COLORS.find((candidate) => candidate.id === color) ?? PLAYER_COLORS[0];

export const getPlayerColorStyle = (color: string) => {
  const definition = getColor(color);

  return {
    fill: definition.fill,
    label: definition.label,
    stroke: definition.stroke,
  };
};

export const listOwnedPlayerNfts = (owner: PublicKey): PlayerNft[] =>
  readAllStoredPlayerNfts()
    .filter((nft) => nft.owner === owner.toBase58())
    .sort((a, b) => a.mintedAt - b.mintedAt)
    .map(hydratePlayerNft);

export const listPlayerNftsInCollection = (): PlayerNft[] =>
  readAllStoredPlayerNfts()
    .sort((a, b) => a.mintedAt - b.mintedAt)
    .map(hydratePlayerNft);

export const readActivePlayerNft = (owner: PublicKey): PlayerNft | null => {
  const activeMint = window.localStorage.getItem(ACTIVE_PLAYER_NFT_STORAGE_KEY);
  const ownedNfts = listOwnedPlayerNfts(owner);

  return (
    ownedNfts.find((nft) => nft.mint.toBase58() === activeMint) ??
    ownedNfts[0] ??
    null
  );
};

export const setActivePlayerNft = (owner: PublicKey, mint: PublicKey) => {
  if (!listOwnedPlayerNfts(owner).some((nft) => nft.mint.equals(mint))) {
    throw new Error("Selected player NFT is not owned by this wallet.");
  }

  window.localStorage.setItem(ACTIVE_PLAYER_NFT_STORAGE_KEY, mint.toBase58());
};

export const mintLocalPlayerNft = (
  owner: PublicKey,
  color: PlayerColorId
): PlayerNft => {
  const colorDefinition = getColor(color);
  const mint = Keypair.generate().publicKey;
  const sequence = listOwnedPlayerNfts(owner).length + 1;
  const nft: StoredPlayerNft = {
    collection: PLAYER_COLLECTION_ID,
    mint: mint.toBase58(),
    owner: owner.toBase58(),
    color: colorDefinition.id,
    mintedAt: Date.now(),
    metadata: {
      name: `Open Wilds Player #${sequence}`,
      symbol: "OWP",
      description: "A player character in Open Wilds.",
      attributes: [
        {
          trait_type: "Color",
          value: colorDefinition.label,
        },
      ],
      properties: {
        collection: PLAYER_COLLECTION_ID,
        category: "image",
      },
    },
  };

  writeAllStoredPlayerNfts([...readAllStoredPlayerNfts(), nft]);
  setActivePlayerNft(owner, mint);
  return hydratePlayerNft(nft);
};

export const clearActivePlayerNft = () => {
  window.localStorage.removeItem(ACTIVE_PLAYER_NFT_STORAGE_KEY);
};
