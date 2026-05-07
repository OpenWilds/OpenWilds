use bolt_lang::*;

declare_id!("G6qkktc5oWkPHFmhk8x3UwzZ5WuQLE5En7PGteko6mhK");

pub const FEATURE_FARMABLE: u32 = 1 << 0;
pub const FEATURE_MINABLE: u32 = 1 << 1;
pub const FEATURE_FORAGEABLE: u32 = 1 << 2;
pub const FEATURE_BLOCKS_MOVEMENT: u32 = 1 << 3;

#[component(delegate)]
#[derive(Default)]
pub struct TerrainType {
    pub terrain_type_id: u16,
    pub feature_flags: u32,
    pub primary_drop_item_id: u16,
    pub secondary_drop_item_id: u16,
    pub drop_rate_bps: u16,
}
