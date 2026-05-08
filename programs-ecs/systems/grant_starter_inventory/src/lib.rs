use bolt_lang::*;
use inventory::Inventory;
use player_owner::PlayerOwner;
use serde::Deserialize;

declare_id!("DAMdALMLCxCbiMHJovqEvr5c1kvfNdfyN9Nfxs93rhxY");

const STARTER_TURNIP_SEED_ID: u16 = 100;
const STARTER_WHEAT_SEED_ID: u16 = 102;
const STARTER_APPLE_SAPLING_ID: u16 = 120;
const STARTER_ACORN_ID: u16 = 122;

#[system]
pub mod grant_starter_inventory {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let grant: StarterGrant = if args.is_empty() {
            StarterGrant::default()
        } else {
            serde_json::from_slice(&args)
                .map_err(|_| error!(GrantStarterInventoryError::InvalidGrantArgs))?
        };

        let inventory = &mut ctx.accounts.inventory;
        require!(
            is_player_authority(
                &ctx.accounts.player_owner,
                ctx.accounts.authority.key(),
                &[inventory.bolt_metadata.authority],
            ),
            GrantStarterInventoryError::InvalidPlayerAuthority
        );

        require!(
            inventory.item_ids.iter().all(|item_id| *item_id == 0),
            GrantStarterInventoryError::AlreadyGranted
        );

        inventory.add_item(STARTER_TURNIP_SEED_ID, grant.turnip_seeds)?;
        inventory.add_item(STARTER_WHEAT_SEED_ID, grant.wheat_seeds)?;
        inventory.add_item(STARTER_APPLE_SAPLING_ID, grant.apple_saplings)?;
        inventory.add_item(STARTER_ACORN_ID, grant.acorns)?;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub inventory: Inventory,
    }
}

#[derive(Deserialize)]
struct StarterGrant {
    turnip_seeds: u16,
    wheat_seeds: u16,
    apple_saplings: u16,
    acorns: u16,
}

impl Default for StarterGrant {
    fn default() -> Self {
        Self {
            turnip_seeds: 6,
            wheat_seeds: 4,
            apple_saplings: 1,
            acorns: 2,
        }
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
pub enum GrantStarterInventoryError {
    #[msg("Starter inventory args must include turnip_seeds, wheat_seeds, apple_saplings, and acorns.")]
    InvalidGrantArgs,
    #[msg("Starter inventory has already been granted.")]
    AlreadyGranted,
    #[msg("Player inventory must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
