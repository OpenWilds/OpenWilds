use active_action::ActiveAction;
use bolt_lang::*;
use energy::Energy;
use player_owner::PlayerOwner;
use position::Position;
use serde::Deserialize;

declare_id!("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5");

const GRID_SIZE: i64 = 20;
const WALK_ENERGY_PER_TILE: u64 = 1;
const WALK_SECONDS_PER_TILE: i64 = 2;

#[system]
pub mod movement {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: MoveTarget =
            serde_json::from_slice(&args).map_err(|_| error!(MovementError::InvalidMoveArgs))?;

        require!(
            target.x >= 0 && target.x < GRID_SIZE && target.y >= 0 && target.y < GRID_SIZE,
            MovementError::TargetOutOfBounds
        );

        let authority = ctx.accounts.authority.key();
        require!(
            is_player_authority(
                &ctx.accounts.player_owner,
                authority,
                &[
                    ctx.accounts.position.bolt_metadata.authority,
                    ctx.accounts.energy.bolt_metadata.authority,
                    ctx.accounts.active_action.bolt_metadata.authority,
                ],
            ),
            MovementError::InvalidPlayerAuthority
        );
        let now = Clock::get()?.unix_timestamp;
        let active_action = &mut ctx.accounts.active_action;

        active_action.clear_if_done(now);
        require!(
            !active_action.is_active(now),
            MovementError::ActionInProgress
        );

        let position = &mut ctx.accounts.position;
        let distance = position.x.abs_diff(target.x) + position.y.abs_diff(target.y);
        let cost = distance * WALK_ENERGY_PER_TILE;
        let energy = &mut ctx.accounts.energy;

        if energy.max == 0 {
            energy.current = energy::DEFAULT_MAX_ENERGY;
            energy.max = energy::DEFAULT_MAX_ENERGY;
        }

        require!(cost > 0, MovementError::ZeroDistanceMove);
        require!(energy.current >= cost, MovementError::NotEnoughEnergy);

        energy.current -= cost;
        position.x = target.x;
        position.y = target.y;
        active_action.start(
            active_action::ACTION_MOVE,
            now,
            (distance as i64) * WALK_SECONDS_PER_TILE,
        );

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_owner: PlayerOwner,
        pub position: Position,
        pub energy: Energy,
        pub active_action: ActiveAction,
    }
}

#[derive(Deserialize)]
struct MoveTarget {
    x: i64,
    y: i64,
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
pub enum MovementError {
    #[msg("Movement system expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidMoveArgs,
    #[msg("Target grid position is outside the 20x20 board.")]
    TargetOutOfBounds,
    #[msg("Movement action must move at least one tile.")]
    ZeroDistanceMove,
    #[msg("Not enough energy for this movement action.")]
    NotEnoughEnergy,
    #[msg("Another action is still in progress.")]
    ActionInProgress,
    #[msg("Player movement components must belong to the transaction authority.")]
    InvalidPlayerAuthority,
}
