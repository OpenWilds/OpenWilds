use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;

declare_id!("AHpcKdhujpiTq8oGbxbCknEfmQQwya6cmvywFL89iZUs");

const SLEEP_SECONDS: i64 = 5;

#[system]
pub mod sleep {
    pub fn execute(ctx: Context<Components>, _args: Vec<u8>) -> Result<Components> {
        let now = Clock::get()?.unix_timestamp;
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
        pub energy: Energy,
        pub active_action: ActiveAction,
    }
}

#[error_code]
pub enum SleepError {
    #[msg("Another action is still in progress.")]
    ActionInProgress,
}
