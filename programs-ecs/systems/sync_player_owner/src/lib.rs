use bolt_lang::*;
use player_owner::PlayerOwner;
use serde::Deserialize;

declare_id!("4rkkMbGqa5D7E3CW7wCiLMdpV96wGQcFRZLZiqMgX1ia");

const SPL_TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

#[system]
pub mod sync_player_owner {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let args: SyncPlayerOwnerArgs =
            serde_json::from_slice(&args).map_err(|_| error!(SyncPlayerOwnerError::InvalidArgs))?;
        let signer = ctx.accounts.authority.key();
        let player_mint = pubkey_from_bytes(args.player_mint)?;
        let token_account_key = pubkey_from_bytes(args.token_account)?;

        let token_account_info = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == token_account_key)
            .ok_or(error!(SyncPlayerOwnerError::MissingTokenAccount))?;

        require_keys_eq!(
            *token_account_info.owner,
            SPL_TOKEN_PROGRAM_ID,
            SyncPlayerOwnerError::InvalidTokenAccount
        );
        let token_account = parse_token_account(token_account_info)?;

        require_keys_eq!(
            token_account.mint,
            player_mint,
            SyncPlayerOwnerError::InvalidPlayerMint
        );
        require_keys_eq!(
            token_account.owner,
            signer,
            SyncPlayerOwnerError::InvalidTokenOwner
        );
        require!(
            token_account.amount == 1,
            SyncPlayerOwnerError::InvalidTokenAmount
        );

        let player_owner = &mut ctx.accounts.player_owner;
        require!(
            player_owner.player_mint == Pubkey::default()
                || player_owner.player_mint == player_mint,
            SyncPlayerOwnerError::InvalidPlayerMint
        );

        player_owner.player_mint = player_mint;
        player_owner.owner = signer;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
    }
}

#[derive(Deserialize)]
struct SyncPlayerOwnerArgs {
    player_mint: [u8; 32],
    token_account: [u8; 32],
}

struct ParsedTokenAccount {
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
}

fn pubkey_from_bytes(bytes: [u8; 32]) -> Result<Pubkey> {
    Pubkey::try_from(bytes.as_slice()).map_err(|_| error!(SyncPlayerOwnerError::InvalidArgs))
}

fn parse_token_account(account: &AccountInfo) -> Result<ParsedTokenAccount> {
    let data = account.try_borrow_data()?;

    if data.len() < 72 {
        return err!(SyncPlayerOwnerError::InvalidTokenAccount);
    }

    let mint = Pubkey::try_from(&data[0..32])
        .map_err(|_| error!(SyncPlayerOwnerError::InvalidTokenAccount))?;
    let owner = Pubkey::try_from(&data[32..64])
        .map_err(|_| error!(SyncPlayerOwnerError::InvalidTokenAccount))?;
    let amount = u64::from_le_bytes(
        data[64..72]
            .try_into()
            .map_err(|_| error!(SyncPlayerOwnerError::InvalidTokenAccount))?,
    );

    Ok(ParsedTokenAccount {
        mint,
        owner,
        amount,
    })
}

#[error_code]
pub enum SyncPlayerOwnerError {
    #[msg("Sync player owner expected JSON args with player_mint and token_account.")]
    InvalidArgs,
    #[msg("Missing player NFT token account.")]
    MissingTokenAccount,
    #[msg("Invalid player NFT token account.")]
    InvalidTokenAccount,
    #[msg("Player mint does not match.")]
    InvalidPlayerMint,
    #[msg("Signer does not own this player NFT.")]
    InvalidTokenOwner,
    #[msg("Player NFT token amount must be exactly one.")]
    InvalidTokenAmount,
}
