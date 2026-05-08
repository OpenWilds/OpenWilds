use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use farm_type::FarmType;
use inventory::Inventory;
use position::Position;
use serde::Deserialize;
use terrain_type::{TerrainType, FEATURE_FARMABLE};
use tile_farm::TileFarm;
use tile_terrain::TileTerrain;

declare_id!("8g6H4M8cKkieF65YkUDqyJ4AqEFytFUnGEQzrvGc3wkq");

const PLANT_ENERGY_COST: u64 = 1;
const PLANT_SECONDS: i64 = 1;

#[system]
pub mod plant_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: PlantTarget =
            serde_json::from_slice(&args).map_err(|_| error!(PlantTileError::InvalidPlantArgs))?;
        let tile_terrain = load_tile_terrain(&ctx)?;
        let terrain_type = load_terrain_type(&ctx)?;
        let farm_type = load_farm_type(&ctx)?;
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            PlantTileError::ActionInProgress
        );
        require!(
            ctx.accounts.position.x == target.x && ctx.accounts.position.y == target.y,
            PlantTileError::PlayerNotOnTile
        );
        require!(
            tile_terrain.x == target.x && tile_terrain.y == target.y,
            PlantTileError::TileMismatch
        );
        require!(
            tile_terrain.terrain_type_id == terrain_type.terrain_type_id,
            PlantTileError::TerrainTypeMismatch
        );
        require!(
            terrain_type.feature_flags & FEATURE_FARMABLE != 0,
            PlantTileError::TileNotFarmable
        );
        require!(
            target.farm_type_id == farm_type.farm_type_id,
            PlantTileError::FarmTypeMismatch
        );

        let tile_farm = &mut ctx.accounts.tile_farm;
        require!(
            !tile_farm.is_initialized() || (tile_farm.x == target.x && tile_farm.y == target.y),
            PlantTileError::FarmTileMismatch
        );
        require!(!tile_farm.has_plant(), PlantTileError::TileOccupied);
        require!(
            !farm_type.requires_tilled_soil() || tile_farm.is_tilled(),
            PlantTileError::TileNotTilled
        );
        require!(
            ctx.accounts.inventory.quantity(farm_type.seed_item_id) > 0,
            PlantTileError::MissingSeed
        );

        let energy = &mut ctx.accounts.energy;
        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }
        require!(
            energy.current >= PLANT_ENERGY_COST,
            PlantTileError::NotEnoughEnergy
        );

        ctx.accounts
            .inventory
            .remove_item(farm_type.seed_item_id, 1)?;
        tile_farm.x = target.x;
        tile_farm.y = target.y;
        tile_farm.farm_type_id = target.farm_type_id;
        tile_farm.planted_at = now;
        tile_farm.growth_seconds = 0;
        tile_farm.growth_updated_at = now;
        tile_farm.last_harvested_at = 0;
        tile_farm.harvest_count = 0;

        energy.current -= PLANT_ENERGY_COST;
        active_action.start(active_action::ACTION_PLANT, now, PLANT_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
        pub tile_farm: TileFarm,
        pub inventory: Inventory,
    }
}

fn load_tile_terrain(ctx: &Context<Components>) -> Result<TileTerrain> {
    for account_info in ctx.remaining_accounts.iter() {
        if *account_info.owner == tile_terrain::ID {
            let data = &mut &account_info.try_borrow_data()?[..];
            return TileTerrain::try_deserialize(data)
                .map_err(|_| error!(PlantTileError::InvalidTileTerrainAccount));
        }
    }

    err!(PlantTileError::MissingValidationAccount)
}

fn load_terrain_type(ctx: &Context<Components>) -> Result<TerrainType> {
    for account_info in ctx.remaining_accounts.iter() {
        if *account_info.owner == terrain_type::ID {
            let data = &mut &account_info.try_borrow_data()?[..];
            return TerrainType::try_deserialize(data)
                .map_err(|_| error!(PlantTileError::InvalidTerrainTypeAccount));
        }
    }

    err!(PlantTileError::MissingValidationAccount)
}

fn load_farm_type(ctx: &Context<Components>) -> Result<FarmType> {
    for account_info in ctx.remaining_accounts.iter() {
        if *account_info.owner == farm_type::ID {
            let data = &mut &account_info.try_borrow_data()?[..];
            return FarmType::try_deserialize(data)
                .map_err(|_| error!(PlantTileError::InvalidFarmTypeAccount));
        }
    }

    err!(PlantTileError::MissingValidationAccount)
}

#[derive(Deserialize)]
struct PlantTarget {
    x: i64,
    y: i64,
    farm_type_id: u16,
}

#[error_code]
pub enum PlantTileError {
    #[msg("Planting expected JSON args shaped like {{ \"x\": number, \"y\": number, \"farm_type_id\": number }}.")]
    InvalidPlantArgs,
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
    #[msg("Planting requested a different farm type component.")]
    FarmTypeMismatch,
    #[msg("Tile farm component does not match the target tile.")]
    FarmTileMismatch,
    #[msg("Tile already has a plant.")]
    TileOccupied,
    #[msg("This farm type requires tilled soil.")]
    TileNotTilled,
    #[msg("Inventory does not contain the required seed.")]
    MissingSeed,
    #[msg("Not enough energy for planting.")]
    NotEnoughEnergy,
    #[msg("Planting action is missing validation accounts.")]
    MissingValidationAccount,
    #[msg("Tile terrain validation account is invalid.")]
    InvalidTileTerrainAccount,
    #[msg("Terrain type validation account is invalid.")]
    InvalidTerrainTypeAccount,
    #[msg("Farm type validation account is invalid.")]
    InvalidFarmTypeAccount,
}
