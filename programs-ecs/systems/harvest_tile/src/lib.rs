use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::FarmType;
use inventory::Inventory;
use player_owner::PlayerOwner;
use position::Position;
use serde::Deserialize;
use tile_farm::{game_time_from_unix, TileFarm};

declare_id!("BGdMrM8tY4myjV3iddnPH4mKpZ8LoaABjY1eoyuqfknp");

const HARVEST_ENERGY_COST: u64 = 1;
const HARVEST_SECONDS: i64 = 1;

#[system]
pub mod harvest_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(HarvestTileError::InvalidTileArgs))?;
        let farm_type = load_farm_type(&ctx)?;
        let action_now = Clock::get()?.unix_timestamp;
        let now = game_time_from_unix(action_now);
        let authority = ctx.accounts.authority.key();
        require!(
            is_player_authority(
                &ctx.accounts.player_owner,
                authority,
                &[
                    ctx.accounts.position.bolt_metadata.authority,
                    ctx.accounts.energy.bolt_metadata.authority,
                    ctx.accounts.active_action.bolt_metadata.authority,
                    ctx.accounts.tile_farm.bolt_metadata.authority,
                    ctx.accounts.inventory.bolt_metadata.authority,
                ],
            ),
            HarvestTileError::InvalidPlayerAuthority
        );
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(action_now);
        require!(
            !active_action.is_active(action_now),
            HarvestTileError::ActionInProgress
        );
        require!(
            is_reachable_tile(&ctx.accounts.position, target.x, target.y),
            HarvestTileError::PlayerNotOnTile
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            tile_farm.x == target.x && tile_farm.y == target.y,
            HarvestTileError::TileMismatch
        );
        require!(tile_farm.has_plant(), HarvestTileError::NoPlant);
        require!(
            tile_farm.farm_type_id == farm_type.farm_type_id,
            HarvestTileError::FarmTypeMismatch
        );

        tile_farm.settle_growth(now, farm_type.needs_water());
        require!(
            tile_farm.is_harvest_ready(
                now,
                farm_type.required_growth_seconds,
                farm_type.regrow_seconds,
            ),
            HarvestTileError::NotReady
        );

        let energy = &mut ctx.accounts.energy;
        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }
        require!(
            energy.current >= HARVEST_ENERGY_COST,
            HarvestTileError::NotEnoughEnergy
        );

        ctx.accounts
            .inventory
            .add_item(farm_type.harvest_item_id, farm_type.base_yield)?;

        if farm_type.regrow_seconds == 0 {
            tile_farm.clear_plant();
        } else {
            tile_farm.last_harvested_at = now;
            tile_farm.harvest_count = tile_farm.harvest_count.saturating_add(1);
        }

        energy.current -= HARVEST_ENERGY_COST;
        active_action.start(active_action::ACTION_HARVEST, action_now, HARVEST_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub tile_farm: TileFarm,
        pub inventory: Inventory,
    }
}

fn load_farm_type(ctx: &Context<Components>) -> Result<FarmType> {
    for account_info in ctx.remaining_accounts.iter() {
        if *account_info.owner == farm_type::ID {
            let data = &mut &account_info.try_borrow_data()?[..];
            return FarmType::try_deserialize(data)
                .map_err(|_| error!(HarvestTileError::InvalidFarmTypeAccount));
        }
    }

    err!(HarvestTileError::MissingValidationAccount)
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
}

fn is_reachable_tile(position: &Position, target_x: i64, target_y: i64) -> bool {
    position.x.abs_diff(target_x) <= 1 && position.y.abs_diff(target_y) <= 1
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
pub enum HarvestTileError {
    #[msg("Harvesting expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on or next to the tile.")]
    PlayerNotOnTile,
    #[msg("Tile farm component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile has no plant to harvest.")]
    NoPlant,
    #[msg("Tile farm points at a different farm type.")]
    FarmTypeMismatch,
    #[msg("Plant is not ready to harvest.")]
    NotReady,
    #[msg("Not enough energy for harvesting.")]
    NotEnoughEnergy,
    #[msg("Harvesting action is missing validation accounts.")]
    MissingValidationAccount,
    #[msg("Farm type validation account is invalid.")]
    InvalidFarmTypeAccount,
    #[msg("Player inventory/action components must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
