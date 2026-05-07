use bolt_lang::*;
use serde::Deserialize;
use terrain_type::TerrainType;
use world_authority::WorldAuthority;

declare_id!("9HUAZDNqjGrk2jVaQBx95hUFhdkb1vbKq6PDtsoybsLu");

const MAX_DROP_RATE_BPS: u16 = 10_000;

#[system]
pub mod define_terrain_type {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let definition: TerrainTypeDefinition = serde_json::from_slice(&args)
            .map_err(|_| error!(DefineTerrainTypeError::InvalidDefinitionArgs))?;

        require!(
            definition.terrain_type_id > 0,
            DefineTerrainTypeError::InvalidTerrainTypeId
        );
        require!(
            definition.drop_rate_bps <= MAX_DROP_RATE_BPS,
            DefineTerrainTypeError::InvalidDropRate
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.world_authority.terrain_admin,
            DefineTerrainTypeError::Unauthorized
        );

        let terrain_type = &mut ctx.accounts.terrain_type;
        terrain_type.terrain_type_id = definition.terrain_type_id;
        terrain_type.feature_flags = definition.feature_flags;
        terrain_type.primary_drop_item_id = definition.primary_drop_item_id;
        terrain_type.secondary_drop_item_id = definition.secondary_drop_item_id;
        terrain_type.drop_rate_bps = definition.drop_rate_bps;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
        pub terrain_type: TerrainType,
    }
}

#[derive(Deserialize)]
struct TerrainTypeDefinition {
    terrain_type_id: u16,
    feature_flags: u32,
    primary_drop_item_id: u16,
    secondary_drop_item_id: u16,
    drop_rate_bps: u16,
}

#[error_code]
pub enum DefineTerrainTypeError {
    #[msg(
        "Terrain type definition expected JSON args with id, feature flags, drops, and drop rate."
    )]
    InvalidDefinitionArgs,
    #[msg("Terrain type id must be greater than zero.")]
    InvalidTerrainTypeId,
    #[msg("Drop rate must be between 0 and 10000 basis points.")]
    InvalidDropRate,
    #[msg("Only the terrain admin may define terrain types.")]
    Unauthorized,
}
