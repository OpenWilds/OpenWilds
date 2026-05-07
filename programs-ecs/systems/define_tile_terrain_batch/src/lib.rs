use bolt_lang::*;
use serde::Deserialize;
use tile_terrain::TileTerrain;
use world_authority::WorldAuthority;

declare_id!("EnjiFX1GJCZXWUAxRFYTbQrDHGdKSi3485EVB5xy2dUa");

const GRID_SIZE: i64 = 20;
const WORLD_AUTHORITY_COMPONENT_INDEX: usize = 0;

#[system]
pub mod define_tile_terrain_batch {
    pub fn execute<'info>(ctx: Context<Components<'info>>, args: Vec<u8>) -> Result<Vec<Vec<u8>>> {
        let batch: TileTerrainBatch = serde_json::from_slice(&args)
            .map_err(|_| error!(DefineTileTerrainBatchError::InvalidBatchArgs))?;

        require!(
            !batch.tiles.is_empty(),
            DefineTileTerrainBatchError::EmptyBatch
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.world_authority.terrain_admin,
            DefineTileTerrainBatchError::Unauthorized
        );

        require!(
            ctx.remaining_accounts.len() == WORLD_AUTHORITY_COMPONENT_INDEX + 1 + batch.tiles.len(),
            DefineTileTerrainBatchError::TileAccountCountMismatch
        );

        let mut results = Vec::with_capacity(1 + batch.tiles.len());
        results.push(ctx.accounts.world_authority.try_to_vec()?);

        for (index, definition) in batch.tiles.iter().enumerate() {
            require!(
                definition.x >= 0
                    && definition.x < GRID_SIZE
                    && definition.y >= 0
                    && definition.y < GRID_SIZE,
                DefineTileTerrainBatchError::TileOutOfBounds
            );
            require!(
                definition.terrain_type_id > 0,
                DefineTileTerrainBatchError::InvalidTerrainTypeId
            );

            let account_info = &ctx.remaining_accounts[WORLD_AUTHORITY_COMPONENT_INDEX + 1 + index];
            require_keys_eq!(
                *account_info.owner,
                tile_terrain::ID,
                DefineTileTerrainBatchError::InvalidTileTerrainAccount
            );

            let mut tile_terrain = TileTerrain::default();
            tile_terrain.x = definition.x;
            tile_terrain.y = definition.y;
            tile_terrain.terrain_type_id = definition.terrain_type_id;
            results.push(tile_terrain.try_to_vec()?);
        }

        let output: Result<Vec<Vec<u8>>> = core::result::Result::Ok(results);
        output
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
    }
}

#[derive(Deserialize)]
struct TileTerrainBatch {
    tiles: Vec<TileTerrainDefinition>,
}

#[derive(Deserialize)]
struct TileTerrainDefinition {
    x: i64,
    y: i64,
    terrain_type_id: u16,
}

#[error_code]
pub enum DefineTileTerrainBatchError {
    #[msg("Tile terrain batch expected JSON args shaped like {{ \"tiles\": [{{ \"x\": number, \"y\": number, \"terrain_type_id\": number }}] }}.")]
    InvalidBatchArgs,
    #[msg("Tile terrain batch must contain at least one tile.")]
    EmptyBatch,
    #[msg("Tile terrain batch tile count must match the provided tile component accounts.")]
    TileAccountCountMismatch,
    #[msg("Tile terrain batch includes an account that is not owned by the tile terrain component program.")]
    InvalidTileTerrainAccount,
    #[msg("Tile grid position is outside the 20x20 board.")]
    TileOutOfBounds,
    #[msg("Terrain type id must be greater than zero.")]
    InvalidTerrainTypeId,
    #[msg("Only the terrain admin may define tile terrain.")]
    Unauthorized,
}
