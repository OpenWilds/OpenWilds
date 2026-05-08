import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { PROGRAMS } from "./config";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const GOLD_CONFIG_SEED = "gold-config";
const GOLD_MINT_SEED = "gold-mint";
const GOLD_MINT_AUTHORITY_SEED = "gold-mint-authority";
const PLAYER_GOLD_AUTHORITY_SEED = "player-gold-authority";
const STARTER_GOLD_CLAIM_SEED = "starter-gold-claim-v2";
const TRADE_OFFER_SEED = "trade-offer";
const TRADE_ACCEPTANCE_SEED = "trade-acceptance";

export const GOLD_STARTER_AMOUNT = 100n;
export const GOLD_DECIMALS = 0;

export const getGoldConfigPda = () =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GOLD_CONFIG_SEED)],
    PROGRAMS.openWilds
  )[0];

export const getGoldMintPda = () =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GOLD_MINT_SEED)],
    PROGRAMS.openWilds
  )[0];

export const getGoldMintAuthorityPda = () =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GOLD_MINT_AUTHORITY_SEED)],
    PROGRAMS.openWilds
  )[0];

export const getPlayerGoldAuthorityPda = (playerMint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(PLAYER_GOLD_AUTHORITY_SEED), playerMint.toBuffer()],
    PROGRAMS.openWilds
  )[0];

export const getStarterGoldClaimPda = (playerMint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(STARTER_GOLD_CLAIM_SEED), playerMint.toBuffer()],
    PROGRAMS.openWilds
  )[0];

export const getTradeOfferPda = (buyer: PublicKey, offerId: bigint) => {
  const offerIdBytes = Buffer.alloc(8);
  offerIdBytes.writeBigUInt64LE(offerId);

  return PublicKey.findProgramAddressSync(
    [Buffer.from(TRADE_OFFER_SEED), buyer.toBuffer(), offerIdBytes],
    PROGRAMS.openWilds
  )[0];
};

export const getTradeAcceptancePda = (offer: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(TRADE_ACCEPTANCE_SEED), offer.toBuffer()],
    PROGRAMS.openWilds
  )[0];

export const getAssociatedTokenAddress = (mint: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];

export const getPlayerGoldAccount = (playerMint: PublicKey) =>
  getAssociatedTokenAddress(
    getGoldMintPda(),
    getPlayerGoldAuthorityPda(playerMint)
  );

export const createAssociatedTokenAccountIdempotentInstruction = (
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
) => {
  const ata = getAssociatedTokenAddress(mint, owner);

  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
};

export const decodeTokenAmount = (data: Uint8Array) => {
  if (data.byteLength < 72) {
    return 0n;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(64, true);
};

export const initializeGoldConfigInstruction = (admin: PublicKey) => {
  const data = Buffer.concat([
    discriminator("initialize_gold_config"),
    u64(GOLD_STARTER_AMOUNT),
    Buffer.from([GOLD_DECIMALS]),
  ]);

  return new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: getGoldConfigPda(), isSigner: false, isWritable: true },
      { pubkey: getGoldMintPda(), isSigner: false, isWritable: true },
      { pubkey: getGoldMintAuthorityPda(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
};

export const claimStarterGoldInstruction = (
  owner: PublicKey,
  playerMint: PublicKey,
  playerOwner: PublicKey
) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: getGoldConfigPda(), isSigner: false, isWritable: false },
      {
        pubkey: getStarterGoldClaimPda(playerMint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: getGoldMintPda(), isSigner: false, isWritable: true },
      { pubkey: getGoldMintAuthorityPda(), isSigner: false, isWritable: false },
      {
        pubkey: getPlayerGoldAuthorityPda(playerMint),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPlayerGoldAccount(playerMint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: playerOwner, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      discriminator("claim_starter_gold"),
      playerMint.toBuffer(),
    ]),
  });

export const createTradeOfferInstruction = (args: {
  buyer: PublicKey;
  seller: PublicKey;
  buyerPlayerOwner: PublicKey;
  offerId: bigint;
  sellerPlayerMint: PublicKey;
  buyerEntity: PublicKey;
  sellerEntity: PublicKey;
  itemId: number;
  itemQuantity: number;
  goldAmount: bigint;
  expiresAt: bigint;
}) => {
  const offer = getTradeOfferPda(args.buyer, args.offerId);
  const data = Buffer.concat([
    discriminator("create_trade_offer"),
    u64(args.offerId),
    args.sellerPlayerMint.toBuffer(),
    args.buyerEntity.toBuffer(),
    args.sellerEntity.toBuffer(),
    u16(args.itemId),
    u16(args.itemQuantity),
    u64(args.goldAmount),
    i64(args.expiresAt),
  ]);

  return {
    offer,
    instruction: new TransactionInstruction({
      programId: PROGRAMS.openWilds,
      keys: [
        { pubkey: args.buyer, isSigner: true, isWritable: true },
        { pubkey: args.seller, isSigner: false, isWritable: false },
        { pubkey: getGoldConfigPda(), isSigner: false, isWritable: false },
        { pubkey: args.buyerPlayerOwner, isSigner: false, isWritable: false },
        { pubkey: offer, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  };
};

export const acceptTradeOfferInstruction = (args: {
  seller: PublicKey;
  sellerPlayerOwner: PublicKey;
  offer: PublicKey;
}) => {
  const acceptance = getTradeAcceptancePda(args.offer);

  return {
    acceptance,
    instruction: new TransactionInstruction({
      programId: PROGRAMS.openWilds,
      keys: [
        { pubkey: args.seller, isSigner: true, isWritable: true },
        { pubkey: args.sellerPlayerOwner, isSigner: false, isWritable: false },
        { pubkey: args.offer, isSigner: false, isWritable: true },
        { pubkey: acceptance, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: discriminator("accept_trade_offer"),
    }),
  };
};

export const finalizeTradeOfferInstruction = (args: {
  buyer: PublicKey;
  offer: PublicKey;
  acceptance: PublicKey;
  buyerPlayerMint: PublicKey;
  sellerPlayerMint: PublicKey;
  buyerPlayerOwner: PublicKey;
  sellerPlayerOwner: PublicKey;
}) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: args.buyer, isSigner: true, isWritable: true },
      { pubkey: getGoldConfigPda(), isSigner: false, isWritable: false },
      { pubkey: args.offer, isSigner: false, isWritable: true },
      { pubkey: args.acceptance, isSigner: false, isWritable: false },
      { pubkey: args.buyerPlayerOwner, isSigner: false, isWritable: false },
      { pubkey: args.sellerPlayerOwner, isSigner: false, isWritable: false },
      {
        pubkey: getPlayerGoldAuthorityPda(args.buyerPlayerMint),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPlayerGoldAuthorityPda(args.sellerPlayerMint),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPlayerGoldAccount(args.buyerPlayerMint),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPlayerGoldAccount(args.sellerPlayerMint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator("finalize_trade_offer"),
  });

export const cancelTradeOfferInstruction = (args: {
  buyer: PublicKey;
  offer: PublicKey;
}) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: args.buyer, isSigner: true, isWritable: true },
      { pubkey: args.offer, isSigner: false, isWritable: true },
    ],
    data: discriminator("cancel_trade_offer"),
  });

export const OPEN_WILDS_ACCOUNT_SIZES = {
  tradeOffer: 262,
  tradeAcceptance: 81,
} as const;

export const DISCRIMINATORS: Record<string, number[]> = {
  initialize_gold_config: [144, 13, 118, 187, 68, 188, 25, 114],
  claim_starter_gold: [217, 64, 121, 164, 93, 110, 251, 67],
  create_trade_offer: [240, 221, 182, 51, 162, 212, 114, 220],
  accept_trade_offer: [47, 111, 224, 26, 202, 213, 193, 205],
  cancel_trade_offer: [217, 46, 97, 98, 211, 188, 43, 171],
  finalize_trade_offer: [176, 17, 211, 160, 82, 107, 250, 93],
};

const discriminator = (name: keyof typeof DISCRIMINATORS) =>
  Buffer.from(DISCRIMINATORS[name]);

const u64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
};

const i64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
};

const u16 = (value: number) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
