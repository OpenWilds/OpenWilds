use bolt_lang::*;

declare_id!("AeTFPGveiu5u9qaGpoCFLte95RBbaKYHcPA6VJHGzSJh");

pub const FARM_KIND_CROP: u8 = 1;
pub const FARM_KIND_TREE: u8 = 2;
pub const FARM_FLAG_REQUIRES_TILLED_SOIL: u32 = 1 << 0;
pub const FARM_FLAG_NEEDS_WATER: u32 = 1 << 1;
pub const MAX_GROWTH_STAGES: usize = 8;

#[component(delegate)]
#[derive(Default)]
pub struct FarmType {
    pub farm_type_id: u16,
    pub farm_kind: u8,
    pub seed_item_id: u16,
    pub harvest_item_id: u16,
    pub required_growth_seconds: u32,
    pub regrow_seconds: u32,
    pub base_yield: u16,
    pub chop_item_id: u16,
    pub chop_yield: u16,
    pub stage_count: u8,
    pub stage_threshold_seconds: [u32; MAX_GROWTH_STAGES],
    pub flags: u32,
}

impl FarmType {
    pub fn needs_water(&self) -> bool {
        self.flags & FARM_FLAG_NEEDS_WATER != 0
    }

    pub fn requires_tilled_soil(&self) -> bool {
        self.flags & FARM_FLAG_REQUIRES_TILLED_SOIL != 0
    }
}
