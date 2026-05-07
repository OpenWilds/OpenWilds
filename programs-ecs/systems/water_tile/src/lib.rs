use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::FarmType;
use position::Position;
use serde::Deserialize;
use tile_farm::TileFarm;

declare_id!("Cp5YRnmvnbRPsCucPAGVh6Sorbd5wjDma8sGKYAuveuu");

const WATER_ENERGY_COST: u64 = 1;
const WATER_SECONDS: i64 = 1;
const DEFAULT_WATER_DURATION_SECONDS: i64 = 12 * 60 * 60;
const MAX_WATER_DURATION_SECONDS: i64 = 24 * 60 * 60;

#[system]
pub mod water_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(WaterTileError::InvalidTileArgs))?;
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            WaterTileError::ActionInProgress
        );
        require!(
            ctx.accounts.position.x == target.x && ctx.accounts.position.y == target.y,
            WaterTileError::PlayerNotOnTile
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            tile_farm.x == target.x && tile_farm.y == target.y,
            WaterTileError::TileMismatch
        );
        require!(
            tile_farm.is_tilled() || tile_farm.has_plant(),
            WaterTileError::TileNotPrepared
        );
        require!(
            tile_farm.farm_type_id == 0
                || tile_farm.farm_type_id == ctx.accounts.farm_type.farm_type_id,
            WaterTileError::FarmTypeMismatch
        );

        let needs_water = tile_farm.has_plant() && ctx.accounts.farm_type.needs_water();
        tile_farm.settle_growth(now, needs_water);

        let energy = &mut ctx.accounts.energy;
        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }
        require!(
            energy.current >= WATER_ENERGY_COST,
            WaterTileError::NotEnoughEnergy
        );

        let duration = target
            .water_duration_seconds
            .unwrap_or(DEFAULT_WATER_DURATION_SECONDS)
            .clamp(1, MAX_WATER_DURATION_SECONDS);
        tile_farm.watered_until = tile_farm.watered_until.max(now + duration);

        energy.current -= WATER_ENERGY_COST;
        active_action.start(active_action::ACTION_WATER, now, WATER_SECONDS);

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
    water_duration_seconds: Option<i64>,
}

#[error_code]
pub enum WaterTileError {
    #[msg("Watering expected JSON args with x, y, and optional water_duration_seconds.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on the tile.")]
    PlayerNotOnTile,
    #[msg("Tile farm component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile must be tilled or planted before watering.")]
    TileNotPrepared,
    #[msg("Tile farm points at a different farm type.")]
    FarmTypeMismatch,
    #[msg("Not enough energy for watering.")]
    NotEnoughEnergy,
}
