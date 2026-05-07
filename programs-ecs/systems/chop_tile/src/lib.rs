use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::{FarmType, FARM_KIND_TREE};
use position::Position;
use serde::Deserialize;
use tile_farm::TileFarm;

declare_id!("GctbHkUcDA9AHkDeLtJ1P1sE1oSLoncDGMBYiYPzMAgs");

const CHOP_ENERGY_COST: u64 = 4;
const CHOP_SECONDS: i64 = 4;

#[system]
pub mod chop_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(ChopTileError::InvalidTileArgs))?;
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            ChopTileError::ActionInProgress
        );
        require!(
            ctx.accounts.position.x == target.x && ctx.accounts.position.y == target.y,
            ChopTileError::PlayerNotOnTile
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            tile_farm.x == target.x && tile_farm.y == target.y,
            ChopTileError::TileMismatch
        );
        require!(tile_farm.has_plant(), ChopTileError::NoTree);
        require!(
            tile_farm.farm_type_id == ctx.accounts.farm_type.farm_type_id,
            ChopTileError::FarmTypeMismatch
        );
        require!(
            ctx.accounts.farm_type.farm_kind == FARM_KIND_TREE,
            ChopTileError::NotTree
        );

        tile_farm.settle_growth(now, ctx.accounts.farm_type.needs_water());

        let energy = &mut ctx.accounts.energy;
        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }
        require!(
            energy.current >= CHOP_ENERGY_COST,
            ChopTileError::NotEnoughEnergy
        );

        tile_farm.clear_plant();
        energy.current -= CHOP_ENERGY_COST;
        active_action.start(active_action::ACTION_CHOP, now, CHOP_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub farm_type: FarmType,
        pub tile_farm: TileFarm,
    }
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
}

#[error_code]
pub enum ChopTileError {
    #[msg("Chopping expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on the tile.")]
    PlayerNotOnTile,
    #[msg("Tile farm component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile has no tree to chop.")]
    NoTree,
    #[msg("Tile farm points at a different farm type.")]
    FarmTypeMismatch,
    #[msg("Only tree farm types can be chopped.")]
    NotTree,
    #[msg("Not enough energy for chopping.")]
    NotEnoughEnergy,
}
