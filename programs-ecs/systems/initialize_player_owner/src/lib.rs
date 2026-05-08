use bolt_lang::*;
use player_owner::PlayerOwner;
use serde::Deserialize;

declare_id!("AQfDaprdLStvVNdsn9bNXUH5bwoaWXUbL54ZsJpNm5EV");

#[system]
pub mod initialize_player_owner {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let args: InitializePlayerOwnerArgs = serde_json::from_slice(&args)
            .map_err(|_| error!(InitializePlayerOwnerError::InvalidArgs))?;
        let player_mint = pubkey_from_bytes(args.player_mint)?;
        let owner = ctx.accounts.authority.key();
        let player_owner = &mut ctx.accounts.player_owner;

        require!(
            player_owner.owner == Pubkey::default() || player_owner.owner == owner,
            InitializePlayerOwnerError::OwnerAlreadySet
        );

        player_owner.owner = owner;
        player_owner.player_mint = player_mint;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
    }
}

#[derive(Deserialize)]
struct InitializePlayerOwnerArgs {
    player_mint: [u8; 32],
}

fn pubkey_from_bytes(bytes: [u8; 32]) -> Result<Pubkey> {
    Pubkey::try_from(bytes.as_slice()).map_err(|_| error!(InitializePlayerOwnerError::InvalidArgs))
}

#[error_code]
pub enum InitializePlayerOwnerError {
    #[msg("Player owner initialization expected JSON args with a 32-byte player_mint.")]
    InvalidArgs,
    #[msg("Player owner is already initialized for a different authority.")]
    OwnerAlreadySet,
}
