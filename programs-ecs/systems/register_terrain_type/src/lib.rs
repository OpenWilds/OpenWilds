use bolt_lang::*;
use serde::Deserialize;
use terrain_type::TerrainType;
use world_terrain_registry::WorldTerrainRegistry;

declare_id!("B9qCeXFe5431no3DTZQdZjexyG1cCep1yHjZrxm5c2AM");

const MAX_DROP_RATE_BPS: u16 = 10_000;

#[system]
pub mod register_terrain_type {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let definition: TerrainTypeRegistration = serde_json::from_slice(&args)
            .map_err(|_| error!(RegisterTerrainTypeError::InvalidRegistrationArgs))?;

        require!(
            definition.catalog_version > 0,
            RegisterTerrainTypeError::InvalidCatalogVersion
        );
        require!(
            definition.terrain_type_id > 0,
            RegisterTerrainTypeError::InvalidTerrainTypeId
        );
        require!(
            definition.drop_rate_bps <= MAX_DROP_RATE_BPS,
            RegisterTerrainTypeError::InvalidDropRate
        );

        let registry = &mut ctx.accounts.world_terrain_registry;

        if registry.version == 0 {
            registry.version = definition.catalog_version;
        }

        require!(
            registry.version == definition.catalog_version,
            RegisterTerrainTypeError::CatalogVersionMismatch
        );

        let terrain_type = &mut ctx.accounts.terrain_type;
        let was_unregistered = terrain_type.terrain_type_id == 0;

        terrain_type.terrain_type_id = definition.terrain_type_id;
        terrain_type.feature_flags = definition.feature_flags;
        terrain_type.primary_drop_item_id = definition.primary_drop_item_id;
        terrain_type.secondary_drop_item_id = definition.secondary_drop_item_id;
        terrain_type.drop_rate_bps = definition.drop_rate_bps;

        if was_unregistered {
            registry.terrain_type_count = registry
                .terrain_type_count
                .checked_add(1)
                .ok_or(error!(RegisterTerrainTypeError::TooManyTerrainTypes))?;
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_terrain_registry: WorldTerrainRegistry,
        pub terrain_type: TerrainType,
    }
}

#[derive(Deserialize)]
struct TerrainTypeRegistration {
    catalog_version: u32,
    terrain_type_id: u16,
    feature_flags: u32,
    primary_drop_item_id: u16,
    secondary_drop_item_id: u16,
    drop_rate_bps: u16,
}

#[error_code]
pub enum RegisterTerrainTypeError {
    #[msg("Terrain type registration expected JSON args with catalog version, id, feature flags, drops, and drop rate.")]
    InvalidRegistrationArgs,
    #[msg("Terrain catalog version must be greater than zero.")]
    InvalidCatalogVersion,
    #[msg("Terrain type id must be greater than zero.")]
    InvalidTerrainTypeId,
    #[msg("Drop rate must be between 0 and 10000 basis points.")]
    InvalidDropRate,
    #[msg("Terrain type registration uses a different catalog version than the world registry.")]
    CatalogVersionMismatch,
    #[msg("Terrain registry cannot track more terrain types.")]
    TooManyTerrainTypes,
}
