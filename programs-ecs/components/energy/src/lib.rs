use bolt_lang::*;

declare_id!("EXfYuzbCqe3VoUrG37gvkhxMmCMBKfvj5DRodsjmG6Pg");

pub const DEFAULT_MAX_ENERGY: u64 = 100;

#[component(delegate)]
#[derive(Default)]
pub struct Energy {
    pub current: u64,
    pub max: u64,
}
