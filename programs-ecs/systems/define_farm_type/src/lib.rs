use bolt_lang::*;
use farm_type::{FarmType, FARM_KIND_CROP, FARM_KIND_TREE, MAX_GROWTH_STAGES};
use serde::Deserialize;
use world_authority::WorldAuthority;

declare_id!("F14xPRR4xx6S8sufyU9MDfdCeCEp6XAFDGTKDfPzfD4y");

#[system]
pub mod define_farm_type {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let definition: FarmTypeDefinition = serde_json::from_slice(&args)
            .map_err(|_| error!(DefineFarmTypeError::InvalidFarmTypeArgs))?;

        require!(
            definition.farm_type_id > 0,
            DefineFarmTypeError::InvalidFarmTypeId
        );
        require!(
            definition.farm_kind == FARM_KIND_CROP || definition.farm_kind == FARM_KIND_TREE,
            DefineFarmTypeError::InvalidFarmKind
        );
        require!(
            definition.required_growth_seconds > 0,
            DefineFarmTypeError::InvalidGrowthSeconds
        );
        require!(
            definition.stage_count > 0 && definition.stage_count as usize <= MAX_GROWTH_STAGES,
            DefineFarmTypeError::InvalidStageCount
        );
        require!(
            definition.base_yield > 0 || definition.chop_yield > 0,
            DefineFarmTypeError::InvalidYield
        );
        let mut previous_stage_threshold = 0;
        for index in 0..definition.stage_count as usize {
            let stage_threshold = definition.stage_threshold_seconds[index];
            require!(
                stage_threshold <= definition.required_growth_seconds,
                DefineFarmTypeError::InvalidStageThresholds
            );
            require!(
                index == 0 || stage_threshold > previous_stage_threshold,
                DefineFarmTypeError::InvalidStageThresholds
            );
            previous_stage_threshold = stage_threshold;
        }
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.world_authority.terrain_admin,
            DefineFarmTypeError::Unauthorized
        );

        let farm_type = &mut ctx.accounts.farm_type;
        farm_type.farm_type_id = definition.farm_type_id;
        farm_type.farm_kind = definition.farm_kind;
        farm_type.seed_item_id = definition.seed_item_id;
        farm_type.harvest_item_id = definition.harvest_item_id;
        farm_type.required_growth_seconds = definition.required_growth_seconds;
        farm_type.regrow_seconds = definition.regrow_seconds;
        farm_type.base_yield = definition.base_yield;
        farm_type.chop_item_id = definition.chop_item_id;
        farm_type.chop_yield = definition.chop_yield;
        farm_type.stage_count = definition.stage_count;
        farm_type.stage_threshold_seconds = definition.stage_threshold_seconds;
        farm_type.flags = definition.flags;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub world_authority: WorldAuthority,
        pub farm_type: FarmType,
    }
}

#[derive(Deserialize)]
struct FarmTypeDefinition {
    farm_type_id: u16,
    farm_kind: u8,
    seed_item_id: u16,
    harvest_item_id: u16,
    required_growth_seconds: u32,
    regrow_seconds: u32,
    base_yield: u16,
    #[serde(default)]
    chop_item_id: u16,
    #[serde(default)]
    chop_yield: u16,
    stage_count: u8,
    stage_threshold_seconds: [u32; MAX_GROWTH_STAGES],
    flags: u32,
}

#[error_code]
pub enum DefineFarmTypeError {
    #[msg("Farm type definition expected JSON args with id, kind, growth timing, yield, stages, and flags.")]
    InvalidFarmTypeArgs,
    #[msg("Farm type id must be greater than zero.")]
    InvalidFarmTypeId,
    #[msg("Farm kind must be crop or tree.")]
    InvalidFarmKind,
    #[msg("Required growth seconds must be greater than zero.")]
    InvalidGrowthSeconds,
    #[msg("Stage count must be between 1 and the maximum growth stages.")]
    InvalidStageCount,
    #[msg("Farm type must have either harvest yield or chop yield.")]
    InvalidYield,
    #[msg("Stage thresholds must be increasing and no greater than required growth seconds.")]
    InvalidStageThresholds,
    #[msg("Only the terrain admin may define farm types.")]
    Unauthorized,
}
