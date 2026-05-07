use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use position::Position;
use serde::Deserialize;
use terrain_type::{TerrainType, FEATURE_FARMABLE};
use tile_farm::{TileFarm, SOIL_TILLED};
use tile_terrain::TileTerrain;

declare_id!("GGf7T4KZ2sJGwiuu6e7bTAc17VwQAR5xKmp9NvF9CmUN");

const TILL_ENERGY_COST: u64 = 2;
const TILL_SECONDS: i64 = 2;

#[system]
pub mod till_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(TillTileError::InvalidTileArgs))?;
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            TillTileError::ActionInProgress
        );
        require!(
            ctx.accounts.position.x == target.x && ctx.accounts.position.y == target.y,
            TillTileError::PlayerNotOnTile
        );
        require!(
            ctx.accounts.tile_terrain.x == target.x && ctx.accounts.tile_terrain.y == target.y,
            TillTileError::TileMismatch
        );
        require!(
            ctx.accounts.tile_terrain.terrain_type_id == ctx.accounts.terrain_type.terrain_type_id,
            TillTileError::TerrainTypeMismatch
        );
        require!(
            ctx.accounts.terrain_type.feature_flags & FEATURE_FARMABLE != 0,
            TillTileError::TileNotFarmable
        );

        let energy = &mut ctx.accounts.energy;
        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }
        require!(
            energy.current >= TILL_ENERGY_COST,
            TillTileError::NotEnoughEnergy
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            !tile_farm.is_initialized() || (tile_farm.x == target.x && tile_farm.y == target.y),
            TillTileError::FarmTileMismatch
        );
        require!(
            !tile_farm.has_plant() && !tile_farm.is_tilled(),
            TillTileError::TileAlreadyPrepared
        );
        tile_farm.x = target.x;
        tile_farm.y = target.y;
        tile_farm.soil_state = SOIL_TILLED;

        energy.current -= TILL_ENERGY_COST;
        active_action.start(active_action::ACTION_TILL, now, TILL_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub tile_terrain: TileTerrain,
        pub terrain_type: TerrainType,
        pub tile_farm: TileFarm,
    }
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
}

#[error_code]
pub enum TillTileError {
    #[msg("Tile action expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on the tile.")]
    PlayerNotOnTile,
    #[msg("Tile terrain component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile terrain points at a different terrain type.")]
    TerrainTypeMismatch,
    #[msg("This terrain type is not farmable.")]
    TileNotFarmable,
    #[msg("Not enough energy for tilling.")]
    NotEnoughEnergy,
    #[msg("Tile farm component does not match the target tile.")]
    FarmTileMismatch,
    #[msg("Tile is already prepared or occupied.")]
    TileAlreadyPrepared,
}
