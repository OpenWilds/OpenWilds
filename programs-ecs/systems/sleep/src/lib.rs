use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use open_wilds::{PlayerSession, PLAYER_SESSION_SCOPE_SLEEP, PLAYER_SESSION_SEED};
use player_owner::PlayerOwner;

declare_id!("AHpcKdhujpiTq8oGbxbCknEfmQQwya6cmvywFL89iZUs");

const SLEEP_SECONDS: i64 = 5;

#[system]
pub mod sleep {
    pub fn execute(ctx: Context<Components>, _args: Vec<u8>) -> Result<Components> {
        let now = Clock::get()?.unix_timestamp;
        let authority = ctx.accounts.authority.key();
        require!(
            is_player_authority(
                &ctx.accounts.player_owner,
                authority,
                &[
                    ctx.accounts.energy.bolt_metadata.authority,
                    ctx.accounts.active_action.bolt_metadata.authority,
                ],
                ctx.remaining_accounts,
            ),
            SleepError::InvalidPlayerAuthority
        );
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(!active_action.is_active(now), SleepError::ActionInProgress);

        let energy = &mut ctx.accounts.energy;

        if energy.max == 0 {
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }

        energy.current = energy.max;
        active_action.start(active_action::ACTION_SLEEP, now, SLEEP_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub energy: Energy,
        pub active_action: ActiveAction,
    }
}

fn is_player_authority(
    player_owner: &PlayerOwner,
    signer: Pubkey,
    component_authorities: &[Pubkey],
    remaining_accounts: &[AccountInfo],
) -> bool {
    let components_belong_to_owner = component_authorities
        .iter()
        .all(|component_authority| *component_authority == player_owner.owner);

    components_belong_to_owner
        && (player_owner.owner == signer
            || has_valid_player_session(
                player_owner,
                signer,
                PLAYER_SESSION_SCOPE_SLEEP,
                remaining_accounts,
            ))
}

fn has_valid_player_session(
    player_owner: &PlayerOwner,
    signer: Pubkey,
    required_scope: u32,
    remaining_accounts: &[AccountInfo],
) -> bool {
    remaining_accounts.iter().any(|account| {
        if *account.owner != open_wilds::ID {
            return false;
        }

        let expected = Pubkey::find_program_address(
            &[
                PLAYER_SESSION_SEED,
                player_owner.player_mint.as_ref(),
                player_owner.owner.as_ref(),
                signer.as_ref(),
            ],
            &open_wilds::ID,
        )
        .0;

        if account.key() != expected {
            return false;
        }

        let data = match account.try_borrow_data() {
            Ok(data) => data,
            Err(_) => return false,
        };
        let mut data_ref: &[u8] = &data;
        let session = match PlayerSession::try_deserialize(&mut data_ref) {
            Ok(session) => session,
            Err(_) => return false,
        };

        session.player_mint == player_owner.player_mint
            && session.owner == player_owner.owner
            && session.delegate == signer
            && !session.revoked
            && session.scopes & required_scope == required_scope
    })
}

#[error_code]
pub enum SleepError {
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player sleep components must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
