use bolt_lang::*;
use serde::Deserialize;
use tile_item::TileItem;
use world_authority::WorldAuthority;

declare_id!("AkakKkvTyQoT9jUeYze5KWG841RcpPfY8XV3Bzk5wn4Z");

#[system]
pub mod define_tile_item {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let definition: TileItemDefinition = serde_json::from_slice(&args)
            .map_err(|_| error!(DefineTileItemError::InvalidTileItemArgs))?;
        let authority = &ctx.accounts.world_authority;

        require!(
            authority.terrain_admin == ctx.accounts.authority.key(),
            DefineTileItemError::Unauthorized
        );
        require!(
            definition.item_id != 0 && definition.quantity != 0,
            DefineTileItemError::InvalidItem
        );

        let tile_item = &mut ctx.accounts.tile_item;
        tile_item.x = definition.x;
        tile_item.y = definition.y;
        tile_item.item_id = definition.item_id;
        tile_item.quantity = definition.quantity;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
        pub tile_item: TileItem,
    }
}

#[derive(Deserialize)]
struct TileItemDefinition {
    x: i64,
    y: i64,
    item_id: u16,
    quantity: u16,
}

#[error_code]
pub enum DefineTileItemError {
    #[msg("Tile item definition expected JSON args shaped like {{ \"x\": number, \"y\": number, \"item_id\": number, \"quantity\": number }}.")]
    InvalidTileItemArgs,
    #[msg("Only the configured terrain admin can define tile items.")]
    Unauthorized,
    #[msg("Tile item id and quantity must be non-zero.")]
    InvalidItem,
}
