use bolt_lang::*;

declare_id!("DRtu8UJRPVQFyVboeX9uzx5qdgsGC9bVyViRCxHSgZwJ");

#[component(delegate)]
#[derive(Default)]
pub struct PlayerOwner {
    pub owner: Pubkey,
    pub player_mint: Pubkey,
}
