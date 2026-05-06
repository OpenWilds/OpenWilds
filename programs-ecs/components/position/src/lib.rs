use bolt_lang::*;

declare_id!("7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ");

#[component(delegate)]
#[derive(Default)]
pub struct Position {
    pub x: i64,
    pub y: i64,
}
