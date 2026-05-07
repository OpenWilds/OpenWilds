use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::FarmType;
use inventory::Inventory;
use position::Position;
use serde::Deserialize;
use tile_farm::TileFarm;

declare_id!("BGdMrM8tY4myjV3iddnPH4mKpZ8LoaABjY1eoyuqfknp");

const HARVEST_ENERGY_COST: u64 = 1;
const HARVEST_SECONDS: i64 = 1;

#[system]
pub mod harvest_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(HarvestTileError::InvalidTileArgs))?;
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            HarvestTileError::ActionInProgress
        );
        require!(
            ctx.accounts.position.x == target.x && ctx.accounts.position.y == target.y,
            HarvestTileError::PlayerNotOnTile
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            tile_farm.x == target.x && tile_farm.y == target.y,
            HarvestTileError::TileMismatch
        );
        require!(tile_farm.has_plant(), HarvestTileError::NoPlant);
        require!(
            tile_farm.farm_type_id == ctx.accounts.farm_type.farm_type_id,
            HarvestTileError::FarmTypeMismatch
        );

        tile_farm.settle_growth(now, ctx.accounts.farm_type.needs_water());
        require!(
            tile_farm.is_harvest_ready(
                now,
                ctx.accounts.farm_type.required_growth_seconds,
                ctx.accounts.farm_type.regrow_seconds,
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

        ctx.accounts.inventory.add_item(
            ctx.accounts.farm_type.harvest_item_id,
            ctx.accounts.farm_type.base_yield,
        )?;

        if ctx.accounts.farm_type.regrow_seconds == 0 {
            tile_farm.clear_plant();
        } else {
            tile_farm.last_harvested_at = now;
            tile_farm.harvest_count = tile_farm.harvest_count.saturating_add(1);
        }

        energy.current -= HARVEST_ENERGY_COST;
        active_action.start(active_action::ACTION_HARVEST, now, HARVEST_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub farm_type: FarmType,
        pub tile_farm: TileFarm,
        pub inventory: Inventory,
    }
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
}

#[error_code]
pub enum HarvestTileError {
    #[msg("Harvesting expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on the tile.")]
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
}
