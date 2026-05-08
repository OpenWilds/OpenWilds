use bolt_lang::*;

declare_id!("6RLX336UuzR9yU4FCrLcTc1SE62YyPc57L8pqjk3xdwP");

#[component(delegate)]
#[derive(Default)]
pub struct TileItem {
    pub x: i64,
    pub y: i64,
    pub item_id: u16,
    pub quantity: u16,
}

impl TileItem {
    pub fn has_item(&self) -> bool {
        self.item_id != 0 && self.quantity != 0
    }

    pub fn clear_item(&mut self) {
        self.item_id = 0;
        self.quantity = 0;
    }
}
