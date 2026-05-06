use bolt_lang::*;

declare_id!("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ");

#[component]
#[derive(Default)]
pub struct Position {
    pub x: i64,
    pub y: i64,
    pub z: i64,
    #[max_len(20)]
    pub description: String,
}