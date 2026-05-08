use active_action::ActiveAction;
use bolt_lang::*;
use inventory::Inventory;
use position::Position;
use serde::Deserialize;
use tile_item::TileItem;

declare_id!("3UEFZZDhmaMh1mBZYvxZxk2PZ2Zb4niHg4wpg2iYiW8J");

const GRAB_SECONDS: i64 = 1;

#[system]
pub mod grab_tile {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: TileTarget =
            serde_json::from_slice(&args).map_err(|_| error!(GrabTileError::InvalidTileArgs))?;
        let action_now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(action_now);
        require!(
            !active_action.is_active(action_now),
            GrabTileError::ActionInProgress
        );
        require!(
            is_reachable_tile(&ctx.accounts.position, target.x, target.y),
            GrabTileError::PlayerNotOnTile
        );

        let tile_item = &mut ctx.accounts.tile_item;
        require!(
            tile_item.x == target.x && tile_item.y == target.y,
            GrabTileError::TileMismatch
        );
        require!(tile_item.has_item(), GrabTileError::NoItem);

        ctx.accounts
            .inventory
            .add_item(tile_item.item_id, tile_item.quantity)?;
        tile_item.clear_item();
        active_action.start(active_action::ACTION_GRAB, action_now, GRAB_SECONDS);

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
        pub active_action: ActiveAction,
        pub tile_item: TileItem,
        pub inventory: Inventory,
    }
}

#[derive(Deserialize)]
struct TileTarget {
    x: i64,
    y: i64,
}

fn is_reachable_tile(position: &Position, target_x: i64, target_y: i64) -> bool {
    position.x.abs_diff(target_x) <= 1 && position.y.abs_diff(target_y) <= 1
}

#[error_code]
pub enum GrabTileError {
    #[msg("Grabbing expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidTileArgs,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player must be standing on or next to the tile.")]
    PlayerNotOnTile,
    #[msg("Tile item component does not match the target tile.")]
    TileMismatch,
    #[msg("Tile has no item to grab.")]
    NoItem,
}
