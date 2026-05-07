use bolt_lang::*;
use serde::Deserialize;
use world_authority::WorldAuthority;

declare_id!("C4s2BjhFdGsBN5JTQ88FdQQUoqWMuRKWtwYupzSyd5vB");

#[system]
pub mod initialize_world_authority {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let update: WorldAuthorityUpdate = serde_json::from_slice(&args)
            .map_err(|_| error!(InitializeWorldAuthorityError::InvalidAuthorityArgs))?;
        let authority = &mut ctx.accounts.world_authority;
        let caller = ctx.accounts.authority.key();

        let terrain_admin = Pubkey::new_from_array(update.terrain_admin);

        if authority.terrain_admin == Pubkey::default() {
            require_keys_eq!(
                caller,
                terrain_admin,
                InitializeWorldAuthorityError::Unauthorized
            );
            authority.terrain_admin = terrain_admin;
            return Ok(ctx.accounts);
        }

        require_keys_eq!(
            caller,
            authority.terrain_admin,
            InitializeWorldAuthorityError::Unauthorized
        );
        authority.terrain_admin = terrain_admin;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
    }
}

#[derive(Deserialize)]
struct WorldAuthorityUpdate {
    terrain_admin: [u8; 32],
}

#[error_code]
pub enum InitializeWorldAuthorityError {
    #[msg("World authority initialization expected JSON args with terrain_admin.")]
    InvalidAuthorityArgs,
    #[msg("Only the current terrain admin may update world authority.")]
    Unauthorized,
}
