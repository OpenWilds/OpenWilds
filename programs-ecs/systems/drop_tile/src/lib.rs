use active_action::ActiveAction;
use bolt_lang::*;
use inventory::Inventory;
use open_wilds::PLAYER_SESSION_SCOPE_INVENTORY;
use player_owner::PlayerOwner;
use position::Position;
use serde::Deserialize;
use tile_item::TileItem;

declare_id!("ENLdCrebMYYvRQFaMCNJAn3DCzEZSJ8JXpwVBFX9R7NH");

const DROP_SECONDS: i64 = 1;

#[system]
pub mod drop_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let drop: DropTarget =
            serde_json::from_slice(&args).map_err(|_| error!(DropTileError::InvalidDropArgs))?;
        let action_now = Clock::get()?.unix_timestamp;
        let authority = ctx.accounts.authority.key();
        require!(
            is_player_authority(
                &ctx.accounts.player_owner,
                authority,
                &[
                    ctx.accounts.position.bolt_metadata.authority,
                    ctx.accounts.active_action.bolt_metadata.authority,
                    ctx.accounts.inventory.bolt_metadata.authority,
                ],
                ctx.remaining_accounts,
                PLAYER_SESSION_SCOPE_INVENTORY,
            ),
            DropTileError::InvalidPlayerAuthority
        );
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(action_now);
        require!(
            !active_action.is_active(action_now),
            DropTileError::ActionInProgress
        );
        require!(
            is_reachable_tile(&ctx.accounts.position, drop.x, drop.y),
            DropTileError::PlayerNotOnTile
        );
        require!(
            drop.item_id != 0 && drop.quantity != 0,
            DropTileError::InvalidItem
        );

        let tile_item = &mut ctx.accounts.tile_item;

        if tile_item.has_item() {
            require!(
                tile_item.x == drop.x && tile_item.y == drop.y,
                DropTileError::TileMismatch
            );
            require!(
                tile_item.item_id == drop.item_id,
                DropTileError::DifferentItemOnTile
            );
        } else {
            tile_item.x = drop.x;
            tile_item.y = drop.y;
            tile_item.item_id = drop.item_id;
        }

        ctx.accounts
            .inventory
            .remove_item(drop.item_id, drop.quantity)?;
        tile_item.quantity = tile_item
            .quantity
            .checked_add(drop.quantity)
            .ok_or(error!(DropTileError::QuantityOverflow))?;
        active_action.start(active_action::ACTION_DROP, action_now, DROP_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub position: Position,
        pub active_action: ActiveAction,
        pub tile_item: TileItem,
        pub inventory: Inventory,
    }
}

#[derive(Deserialize)]
struct DropTarget {
    x: i64,
    y: i64,
    item_id: u16,
    quantity: u16,
}

fn is_reachable_tile(position: &Position, target_x: i64, target_y: i64) -> bool {
    position.x.abs_diff(target_x) <= 1 && position.y.abs_diff(target_y) <= 1
}

fn is_player_authority(
    player_owner: &PlayerOwner,
    signer: Pubkey,
    component_authorities: &[Pubkey],
    remaining_accounts: &[AccountInfo],
    required_scope: u32,
) -> bool {
    let components_belong_to_owner = component_authorities
        .iter()
        .all(|component_authority| *component_authority == player_owner.owner);

    components_belong_to_owner
        && (player_owner.owner == signer
            || open_wilds::has_valid_player_session(
                player_owner.player_mint,
                player_owner.owner,
                signer,
                required_scope,
                remaining_accounts,
            ))
}

#[error_code]
pub enum DropTileError {
    #[msg("Dropping expected JSON args shaped like {{ \"x\": number, \"y\": number, \"item_id\": number, \"quantity\": number }}.")]
    InvalidDropArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on or next to the tile.")]
    PlayerNotOnTile,
    #[msg("Tile item component does not match the target tile.")]
    TileMismatch,
    #[msg("Dropped item id and quantity must be non-zero.")]
    InvalidItem,
    #[msg("Tile already contains a different item.")]
    DifferentItemOnTile,
    #[msg("Tile item quantity overflowed.")]
    QuantityOverflow,
    #[msg("Player inventory/action components must belong to the player owner or an authorized agent session.")]
    InvalidPlayerAuthority,
}
