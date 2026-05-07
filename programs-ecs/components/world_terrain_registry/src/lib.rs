use bolt_lang::*;

declare_id!("CbYVrUkZDrFRCBFA6HNNrQtzNgXP111zKqKpMy6KyhYQ");

#[component(delegate)]
#[derive(Default)]
pub struct WorldTerrainRegistry {
    pub version: u32,
    pub terrain_type_count: u16,
}
