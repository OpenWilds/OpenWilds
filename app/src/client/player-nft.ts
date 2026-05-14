import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { ACTIVE_PLAYER_NFT_STORAGE_KEY, PROGRAMS } from "./config";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "./gold";
import type { PlayerSpriteAssetId } from "../assets/visual-assets";

export const PLAYER_COLLECTION_ID = "open-wilds-players-localnet";
export const PLAYER_NFT_SYMBOL = "OWP";

const PLAYER_NFT_REGISTRATION_SEED = "player-nft";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const MINT_SIZE = 82;

export const PLAYER_COLORS = [
  {
    id: "rose",
    label: "Player 1",
    fill: 0xe24a55,
    stroke: 0x84242b,
    spriteAssetId: "player",
  },
  {
    id: "sky",
    label: "Player 2",
    fill: 0x4aa8e2,
    stroke: 0x245b84,
    spriteAssetId: "player2",
  },
  {
    id: "mint",
    label: "Player 3",
    fill: 0x45c88a,
    stroke: 0x24744f,
    spriteAssetId: "player3",
  },
  {
    id: "gold",
    label: "Player 4",
    fill: 0xf3b43f,
    stroke: 0x875b16,
    spriteAssetId: "player4",
  },
  {
    id: "violet",
    label: "Player 5",
    fill: 0x9b6ee8,
    stroke: 0x513282,
    spriteAssetId: "player5",
  },
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

export type PlayerNft = {
  collection: string;
  mint: PublicKey;
  owner: PublicKey;
  tokenAccount: PublicKey;
  color: PlayerColorId;
  metadata: PlayerNftMetadata;
  mintedAt: number;
};

export type MintPlayerNftResult = {
  player: PlayerNft;
  transaction: Transaction;
  mint: Keypair;
};

type PlayerRegistration = {
  playerMint: PublicKey;
  creator: PublicKey;
  createdAt: number;
  color: PlayerColorId;
  name: string;
  symbol: string;
};

const getColor = (color: string) =>
  PLAYER_COLORS.find((candidate) => candidate.id === color) ?? PLAYER_COLORS[0];

export const getPlayerColorStyle = (color: string) => {
  const definition = getColor(color);

  return {
    fill: definition.fill,
    label: definition.label,
    spriteAssetId: definition.spriteAssetId as PlayerSpriteAssetId,
    stroke: definition.stroke,
  };
};

export const getPlayerNftRegistrationPda = (playerMint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(PLAYER_NFT_REGISTRATION_SEED), playerMint.toBuffer()],
    PROGRAMS.openWilds
  )[0];

export const getMetadataPda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];

export const listOwnedPlayerNfts = async (
  connection: Connection,
  owner: PublicKey
): Promise<PlayerNft[]> => {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });
  const candidates = tokenAccounts.value
    .map(({ pubkey, account }) => {
      const info = account.data.parsed?.info;
      const amount = info?.tokenAmount;
      const mint = info?.mint;

      if (!mint || amount?.amount !== "1" || amount?.decimals !== 0) {
        return null;
      }

      return {
        mint: new PublicKey(mint),
        tokenAccount: pubkey,
      };
    })
    .filter(
      (candidate): candidate is { mint: PublicKey; tokenAccount: PublicKey } =>
        Boolean(candidate)
    );

  return hydrateRegisteredPlayers(connection, owner, candidates);
};

export const listPlayerNftsInCollection = async (
  connection: Connection
): Promise<PlayerNft[]> => {
  const accounts = await connection.getProgramAccounts(PROGRAMS.openWilds, {
    filters: [{ dataSize: PLAYER_NFT_REGISTRATION_SIZE }],
  });
  const registrations = accounts
    .map((account) => decodePlayerRegistration(account.account.data))
    .filter((registration): registration is PlayerRegistration =>
      Boolean(registration)
    );

  return Promise.all(
    registrations.map(async (registration) => {
      const tokenAccount = await findCurrentOwnerTokenAccount(
        connection,
        registration.playerMint
      );

      return registrationToPlayerNft(
        registration,
        tokenAccount?.owner ?? registration.creator,
        tokenAccount?.tokenAccount ??
          getAssociatedTokenAddress(
            registration.playerMint,
            registration.creator
          )
      );
    })
  );
};

export const readActivePlayerNft = async (
  connection: Connection,
  owner: PublicKey
): Promise<PlayerNft | null> => {
  const activeMint = window.localStorage.getItem(ACTIVE_PLAYER_NFT_STORAGE_KEY);
  const ownedNfts = await listOwnedPlayerNfts(connection, owner);

  return (
    ownedNfts.find((nft) => nft.mint.toBase58() === activeMint) ??
    ownedNfts[0] ??
    null
  );
};

export const setActivePlayerNft = async (
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
) => {
  const ownedNfts = await listOwnedPlayerNfts(connection, owner);

  if (!ownedNfts.some((nft) => nft.mint.equals(mint))) {
    throw new Error("Selected player NFT is not owned by this wallet.");
  }

  window.localStorage.setItem(ACTIVE_PLAYER_NFT_STORAGE_KEY, mint.toBase58());
};

export const mintPlayerNftOnchain = async (
  connection: Connection,
  owner: PublicKey,
  color: PlayerColorId
): Promise<MintPlayerNftResult> => {
  const metadataProgram = await connection.getAccountInfo(
    TOKEN_METADATA_PROGRAM_ID
  );
  const mint = Keypair.generate();
  const colorDefinition = getColor(color);
  const sequence = Date.now().toString().slice(-6);
  const name = `Open Wilds Player #${sequence}`;
  const tokenAccount = getAssociatedTokenAddress(mint.publicKey, owner);
  const rentLamports = await connection.getMinimumBalanceForRentExemption(
    MINT_SIZE
  );
  const transaction = new Transaction()
    .add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: mint.publicKey,
        lamports: rentLamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      })
    )
    .add(createInitializeMintInstruction(mint.publicKey, owner, 0))
    .add(
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        owner,
        mint.publicKey
      )
    )
    .add(createMintToInstruction(mint.publicKey, tokenAccount, owner, 1n));

  if (metadataProgram?.executable) {
    transaction.add(
      createMetadataInstruction({
        payer: owner,
        mint: mint.publicKey,
        mintAuthority: owner,
        updateAuthority: owner,
        name,
        symbol: PLAYER_NFT_SYMBOL,
        uri: "",
      })
    );
  }

  transaction
    .add(
      registerPlayerNftInstruction({
        owner,
        playerMint: mint.publicKey,
        tokenAccount,
        color,
        name,
        symbol: PLAYER_NFT_SYMBOL,
      })
    )
    .add(createSetAuthorityInstruction(mint.publicKey, owner, null));
  const player = registrationToPlayerNft(
    {
      playerMint: mint.publicKey,
      creator: owner,
      createdAt: Math.floor(Date.now() / 1000),
      color,
      name,
      symbol: PLAYER_NFT_SYMBOL,
    },
    owner,
    tokenAccount
  );

  return { player, transaction, mint };
};

export const clearActivePlayerNft = () => {
  window.localStorage.removeItem(ACTIVE_PLAYER_NFT_STORAGE_KEY);
};

export const clearPlayerNfts = () => {
  clearActivePlayerNft();
};

const PLAYER_NFT_REGISTRATION_SIZE = 139;

const hydrateRegisteredPlayers = async (
  connection: Connection,
  owner: PublicKey,
  candidates: Array<{ mint: PublicKey; tokenAccount: PublicKey }>
) => {
  const accounts = await connection.getMultipleAccountsInfo(
    candidates.map((candidate) => getPlayerNftRegistrationPda(candidate.mint))
  );

  return candidates
    .map((candidate, index) => {
      const registration = accounts[index]
        ? decodePlayerRegistration(accounts[index]!.data)
        : null;

      return registration
        ? registrationToPlayerNft(registration, owner, candidate.tokenAccount)
        : null;
    })
    .filter((player): player is PlayerNft => Boolean(player))
    .sort((a, b) => a.mintedAt - b.mintedAt);
};

const registrationToPlayerNft = (
  registration: PlayerRegistration,
  owner: PublicKey,
  tokenAccount: PublicKey
): PlayerNft => ({
  collection: PLAYER_COLLECTION_ID,
  mint: registration.playerMint,
  owner,
  tokenAccount,
  color: registration.color,
  mintedAt: registration.createdAt * 1000,
  metadata: {
    name: registration.name,
    symbol: registration.symbol,
    description: "A player character in Open Wilds.",
    attributes: [
      { trait_type: "Color", value: getColor(registration.color).label },
    ],
    properties: {
      collection: PLAYER_COLLECTION_ID,
      category: "image",
    },
  },
});

const findCurrentOwnerTokenAccount = async (
  connection: Connection,
  mint: PublicKey
) => {
  const largest = await connection.getTokenLargestAccounts(mint);
  const holder = largest.value.find((account) => account.amount === "1");

  if (!holder) {
    return null;
  }

  const account = await connection.getParsedAccountInfo(holder.address);
  const info =
    account.value?.data && "parsed" in account.value.data
      ? account.value.data.parsed?.info
      : null;

  return info?.owner
    ? {
        owner: new PublicKey(info.owner),
        tokenAccount: holder.address,
      }
    : null;
};

const decodePlayerRegistration = (
  data: Uint8Array
): PlayerRegistration | null => {
  if (data.byteLength < PLAYER_NFT_REGISTRATION_SIZE) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    playerMint: new PublicKey(data.slice(8, 40)),
    creator: new PublicKey(data.slice(40, 72)),
    createdAt: Number(view.getBigInt64(72, true)),
    color: fixedBytesToString(data.slice(80, 96)) as PlayerColorId,
    name: fixedBytesToString(data.slice(96, 128)),
    symbol: fixedBytesToString(data.slice(128, 138)),
  };
};

const fixedBytes = (value: string, length: number) => {
  const buffer = Buffer.alloc(length);
  buffer.set(Buffer.from(value).slice(0, length));
  return buffer;
};

const fixedBytesToString = (data: Uint8Array) =>
  Buffer.from(data).toString("utf8").replace(/\0+$/g, "");

const registerPlayerNftInstruction = (args: {
  owner: PublicKey;
  playerMint: PublicKey;
  tokenAccount: PublicKey;
  color: string;
  name: string;
  symbol: string;
}) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.playerMint, isSigner: false, isWritable: false },
      { pubkey: args.tokenAccount, isSigner: false, isWritable: false },
      {
        pubkey: getPlayerNftRegistrationPda(args.playerMint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([153, 31, 184, 48, 132, 71, 54, 152]),
      fixedBytes(args.color, 16),
      fixedBytes(args.name, 32),
      fixedBytes(args.symbol, 10),
    ]),
  });

const createInitializeMintInstruction = (
  mint: PublicKey,
  mintAuthority: PublicKey,
  decimals: number
) =>
  new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from([0, decimals]),
      mintAuthority.toBuffer(),
      cOptionPubkey(null),
    ]),
  });

const createMintToInstruction = (
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint
) =>
  new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([7]), u64(amount)]),
  });

const createSetAuthorityInstruction = (
  account: PublicKey,
  currentAuthority: PublicKey,
  newAuthority: PublicKey | null
) =>
  new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: currentAuthority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([6, 0]), cOptionPubkey(newAuthority)]),
  });

const createMetadataInstruction = (args: {
  payer: PublicKey;
  mint: PublicKey;
  mintAuthority: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}) =>
  new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: getMetadataPda(args.mint), isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: args.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from([33]),
      borshString(args.name),
      borshString(args.symbol),
      borshString(args.uri),
      u16(0),
      Buffer.from([0, 0, 0, 1, 0]),
    ]),
  });

const cOptionPubkey = (pubkey: PublicKey | null) =>
  pubkey
    ? Buffer.concat([Buffer.from([1, 0, 0, 0]), pubkey.toBuffer()])
    : Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.alloc(32)]);

const borshString = (value: string) => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
};

const u16 = (value: number) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};

const u64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
};
