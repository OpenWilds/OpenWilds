use bolt_lang::*;
use position::Position;
use serde::Deserialize;

declare_id!("pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5");

const GRID_SIZE: i64 = 20;

#[system]
pub mod movement {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let target: MoveTarget =
            serde_json::from_slice(&args).map_err(|_| error!(MovementError::InvalidMoveArgs))?;

        require!(
            target.x >= 0 && target.x < GRID_SIZE && target.y >= 0 && target.y < GRID_SIZE,
            MovementError::TargetOutOfBounds
        );

        let position = &mut ctx.accounts.position;
        position.x = target.x;
        position.y = target.y;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub position: Position,
    }
}

#[derive(Deserialize)]
struct MoveTarget {
    x: i64,
    y: i64,
}

#[error_code]
pub enum MovementError {
    #[msg("Movement system expected JSON args shaped like {{ \"x\": number, \"y\": number }}.")]
    InvalidMoveArgs,
    #[msg("Target grid position is outside the 20x20 board.")]
    TargetOutOfBounds,
}
