use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::FarmType;
use player_owner::PlayerOwner;
use position::Position;
use serde::Deserialize;
use tile_farm::{game_time_from_unix, TileFarm};

declare_id!("Cp5YRnmvnbRPsCucPAGVh6Sorbd5wjDma8sGKYAuveuu");

const WATER_ENERGY_COST: u64 = 1;
const WATER_SECONDS: i64 = 1;
const DEFAULT_WATER_DURATION_SECONDS: i64 = 24 * 60 * 60;
const MAX_WATER_DURATION_SECONDS: i64 = 24 * 60 * 60;

#[system]
pub mod water_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(WaterTileError::InvalidTileArgs))?;
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
                ],
            ),
            WaterTileError::InvalidPlayerAuthority
        );
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(action_now);
        require!(
            !active_action.is_active(action_now),
            WaterTileError::ActionInProgress
        );
        require!(
            is_reachable_tile(&ctx.accounts.position, target.x, target.y),
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
            tile_farm.farm_type_id == 0 || tile_farm.farm_type_id == farm_type.farm_type_id,
            WaterTileError::FarmTypeMismatch
        );

        let needs_water = tile_farm.has_plant() && farm_type.needs_water();
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
        active_action.start(active_action::ACTION_WATER, action_now, WATER_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub tile_farm: TileFarm,
    }
}

fn load_farm_type(ctx: &Context<Components>) -> Result<FarmType> {
    for account_info in ctx.remaining_accounts.iter() {
        if *account_info.owner == farm_type::ID {
            let data = &mut &account_info.try_borrow_data()?[..];
            return FarmType::try_deserialize(data)
                .map_err(|_| error!(WaterTileError::InvalidFarmTypeAccount));
        }
    }

    err!(WaterTileError::MissingValidationAccount)
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
    water_duration_seconds: Option<i64>,
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
pub enum WaterTileError {
    #[msg("Watering expected JSON args with x, y, and optional water_duration_seconds.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on or next to the tile.")]
    PlayerNotOnTile,
    #[msg("Tile farm component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile must be tilled or planted before watering.")]
    TileNotPrepared,
    #[msg("Tile farm points at a different farm type.")]
    FarmTypeMismatch,
    #[msg("Not enough energy for watering.")]
    NotEnoughEnergy,
    #[msg("Watering action is missing validation accounts.")]
    MissingValidationAccount,
    #[msg("Farm type validation account is invalid.")]
    InvalidFarmTypeAccount,
    #[msg("Player farming components must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
