use bolt_lang::prelude::*;

declare_id!("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6");

#[program]
pub mod open_wilds {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
