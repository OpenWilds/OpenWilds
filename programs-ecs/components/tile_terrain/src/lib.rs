use bolt_lang::*;

declare_id!("5hCo8uVeWtjqmeFQAovyLFuW1vZ4wS3kKP7ms7SUyyqk");

#[component(delegate)]
#[derive(Default)]
pub struct TileTerrain {
    pub x: i64,
    pub y: i64,
    pub terrain_type_id: u16,
}
