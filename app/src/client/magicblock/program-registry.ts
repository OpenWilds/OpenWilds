/**
 * MagicBlock deployed-program registry.
 *
 * Centralizes base-layer program-info reads and executable checks. Gameplay and
 * provisioning services call this instead of duplicating "is this program
 * deployed?" logic around transaction code.
 */
import type { Connection } from "@solana/web3.js";
import { PROGRAMS } from "../config";
import { shortAddress } from "../format";

export type MagicBlockProgramName = keyof typeof PROGRAMS;

/** Raised when the local validator is missing one or more required programs. */
export class MissingProgramsError extends Error {}

/** Reads MagicBlock/Open Wilds program deployment state from the base layer. */
export class MagicBlockProgramRegistry {
  constructor(private readonly connection: Connection) {}

  /** Returns account info for every configured program id. */
  fetchProgramInfos() {
    return this.connection.getMultipleAccountsInfo(Object.values(PROGRAMS));
  }

  /** Throws when any named program is absent or not executable. */
  async requireDeployed(programNames: MagicBlockProgramName[]) {
    const entries = programNames.map((name) => [name, PROGRAMS[name]] as const);
    const programInfos = await this.connection.getMultipleAccountsInfo(
      entries.map(([, programId]) => programId)
    );
    const missingPrograms = entries
      .filter(([, _programId], index) => !programInfos[index]?.executable)
      .map(([name, programId]) => `${name} ${shortAddress(programId)}`);

    if (missingPrograms.length > 0) {
      throw new MissingProgramsError(
        `Missing deployed program(s): ${missingPrograms.join(
          ", "
        )}. Run localnet deploy.`
      );
    }
  }
}
