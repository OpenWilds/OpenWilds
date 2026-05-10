import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { PROGRAMS } from "./config";

const PLAYER_SESSION_SEED = "player-session";

export const PLAYER_SESSION_SCOPE_MOVE = 1 << 0;
export const PLAYER_SESSION_SCOPE_SLEEP = 1 << 1;
export const PLAYER_SESSION_SCOPES_MOVEMENT_ONLY =
  PLAYER_SESSION_SCOPE_MOVE | PLAYER_SESSION_SCOPE_SLEEP;

const PLAYER_SESSION_SIZE = 118;
const PLAYER_SESSION_DISCRIMINATOR = Buffer.from([
  89, 95, 51, 45, 127, 42, 173, 223,
]);

export type PlayerSessionState = {
  playerMint: PublicKey;
  owner: PublicKey;
  delegate: PublicKey;
  scopes: number;
  revoked: boolean;
  createdAt: number;
  bump: number;
};

export const getPlayerSessionPda = (
  playerMint: PublicKey,
  owner: PublicKey,
  delegate: PublicKey
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from(PLAYER_SESSION_SEED),
      playerMint.toBuffer(),
      owner.toBuffer(),
      delegate.toBuffer(),
    ],
    PROGRAMS.openWilds
  )[0];

export const grantPlayerSessionInstruction = (args: {
  owner: PublicKey;
  playerMint: PublicKey;
  ownerTokenAccount: PublicKey;
  delegate: PublicKey;
  scopes?: number;
}) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.playerMint, isSigner: false, isWritable: false },
      { pubkey: args.ownerTokenAccount, isSigner: false, isWritable: false },
      {
        pubkey: getPlayerSessionPda(args.playerMint, args.owner, args.delegate),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([192, 112, 248, 25, 109, 213, 103, 39]),
      args.delegate.toBuffer(),
      u32(args.scopes ?? PLAYER_SESSION_SCOPES_MOVEMENT_ONLY),
    ]),
  });

export const revokePlayerSessionInstruction = (args: {
  owner: PublicKey;
  playerMint: PublicKey;
  ownerTokenAccount: PublicKey;
  delegate: PublicKey;
}) =>
  new TransactionInstruction({
    programId: PROGRAMS.openWilds,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.playerMint, isSigner: false, isWritable: false },
      { pubkey: args.ownerTokenAccount, isSigner: false, isWritable: false },
      {
        pubkey: getPlayerSessionPda(args.playerMint, args.owner, args.delegate),
        isSigner: false,
        isWritable: true,
      },
    ],
    data: Buffer.concat([
      Buffer.from([24, 21, 171, 20, 86, 164, 183, 96]),
      args.delegate.toBuffer(),
    ]),
  });

export const decodePlayerSession = (
  data: Uint8Array
): PlayerSessionState | null => {
  if (data.byteLength < PLAYER_SESSION_SIZE) {
    return null;
  }

  if (!Buffer.from(data.slice(0, 8)).equals(PLAYER_SESSION_DISCRIMINATOR)) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    playerMint: new PublicKey(data.slice(8, 40)),
    owner: new PublicKey(data.slice(40, 72)),
    delegate: new PublicKey(data.slice(72, 104)),
    scopes: view.getUint32(104, true),
    revoked: data[108] !== 0,
    createdAt: Number(view.getBigInt64(109, true)),
    bump: data[117],
  };
};

const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};
