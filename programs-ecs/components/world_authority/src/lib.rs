use bolt_lang::*;

declare_id!("HPVrKGMFzX1VSFkEXU5sf9uZZ5bwqJW1jHkrdFgRGFZg");

#[component(delegate)]
#[derive(Default)]
pub struct WorldAuthority {
    pub terrain_admin: Pubkey,
}
