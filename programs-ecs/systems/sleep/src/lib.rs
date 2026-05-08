use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
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
) -> bool {
    player_owner.owner == signer
        && component_authorities
            .iter()
            .all(|component_authority| *component_authority == signer)
}

#[error_code]
pub enum SleepError {
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player sleep components must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
