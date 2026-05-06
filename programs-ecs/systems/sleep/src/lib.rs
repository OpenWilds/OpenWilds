use bolt_lang::*;
use energy::Energy;

declare_id!("AHpcKdhujpiTq8oGbxbCknEfmQQwya6cmvywFL89iZUs");

#[system]
pub mod sleep {
    pub fn execute(ctx: Context<Components>, _args: Vec<u8>) -> Result<Components> {
        let energy = &mut ctx.accounts.energy;

        if energy.max == 0 {
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }

        energy.current = energy.max;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub energy: Energy,
    }
}
