use bolt_lang::*;
use serde::Deserialize;
use tile_terrain::TileTerrain;
use world_authority::WorldAuthority;

declare_id!("DBfTvysc3GQVoazLgbwLr2yqjs8msjaco9q8fgTaLUTy");

const GRID_SIZE: i64 = 20;
const TERRAIN_TYPE_MEADOW: u16 = 1;
const TERRAIN_TYPE_FOREST: u16 = 2;
const TERRAIN_TYPE_STONE: u16 = 3;
const TERRAIN_TYPE_WATER: u16 = 4;

#[system]
pub mod define_tile_terrain {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let definition: TileTerrainDefinition = serde_json::from_slice(&args)
            .map_err(|_| error!(DefineTileTerrainError::InvalidTileTerrainArgs))?;

        require!(
            definition.x >= 0
                && definition.x < GRID_SIZE
                && definition.y >= 0
                && definition.y < GRID_SIZE,
            DefineTileTerrainError::TileOutOfBounds
        );
        require!(
            definition.terrain_type_id > 0,
            DefineTileTerrainError::InvalidTerrainTypeId
        );

        if ctx.accounts.authority.key() != ctx.accounts.world_authority.terrain_admin {
            require!(
                definition.terrain_type_id
                    == deterministic_terrain_type(definition.x, definition.y),
                DefineTileTerrainError::UnauthorizedTerrainDefinition
            );
        }

        let tile_terrain = &mut ctx.accounts.tile_terrain;
        tile_terrain.x = definition.x;
        tile_terrain.y = definition.y;
        tile_terrain.terrain_type_id = definition.terrain_type_id;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
        pub tile_terrain: TileTerrain,
    }
}

fn deterministic_terrain_type(x: i64, y: i64) -> u16 {
    if x <= 1 || y <= 1 {
        TERRAIN_TYPE_WATER
    } else if x > 14 && y < 7 {
        TERRAIN_TYPE_STONE
    } else if x > 4 && x < 10 && y > 3 && y < 12 {
        TERRAIN_TYPE_FOREST
    } else {
        TERRAIN_TYPE_MEADOW
    }
}

#[derive(Deserialize)]
struct TileTerrainDefinition {
    x: i64,
    y: i64,
    terrain_type_id: u16,
}

#[error_code]
pub enum DefineTileTerrainError {
    #[msg("Tile terrain definition expected JSON args shaped like {{ \"x\": number, \"y\": number, \"terrain_type_id\": number }}.")]
    InvalidTileTerrainArgs,
    #[msg("Tile grid position is outside the 20x20 board.")]
    TileOutOfBounds,
    #[msg("Terrain type id must be greater than zero.")]
    InvalidTerrainTypeId,
    #[msg("Only the terrain admin may define tile terrain.")]
    Unauthorized,
    #[msg("Non-admin tile terrain definitions must match deterministic world terrain.")]
    UnauthorizedTerrainDefinition,
}
