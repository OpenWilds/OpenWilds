use bolt_lang::*;

declare_id!("GkbbrRx8N4XsM6ELpKPQVaSvtU7mpNaKdUYh8X14ddCq");

pub const MAX_INVENTORY_SLOTS: usize = 16;

#[component(delegate)]
#[derive(Default)]
pub struct Inventory {
    pub item_ids: [u16; MAX_INVENTORY_SLOTS],
    pub quantities: [u16; MAX_INVENTORY_SLOTS],
}

impl Inventory {
    pub fn quantity(&self, item_id: u16) -> u16 {
        self.item_ids
            .iter()
            .position(|candidate| *candidate == item_id)
            .map(|index| self.quantities[index])
            .unwrap_or(0)
    }

    pub fn add_item(&mut self, item_id: u16, quantity: u16) -> Result<()> {
        if item_id == 0 || quantity == 0 {
            return Ok(());
        }

        if let Some(index) = self
            .item_ids
            .iter()
            .position(|candidate| *candidate == item_id)
        {
            self.quantities[index] = self.quantities[index]
                .checked_add(quantity)
                .ok_or(error!(InventoryError::QuantityOverflow))?;
            return Ok(());
        }

        let index = self
            .item_ids
            .iter()
            .position(|candidate| *candidate == 0)
            .ok_or(error!(InventoryError::InventoryFull))?;

        self.item_ids[index] = item_id;
        self.quantities[index] = quantity;
        Ok(())
    }

    pub fn remove_item(&mut self, item_id: u16, quantity: u16) -> Result<()> {
        if item_id == 0 || quantity == 0 {
            return Ok(());
        }

        let index = self
            .item_ids
            .iter()
            .position(|candidate| *candidate == item_id)
            .ok_or(error!(InventoryError::ItemMissing))?;

        require!(
            self.quantities[index] >= quantity,
            InventoryError::NotEnoughItems
        );

        self.quantities[index] -= quantity;

        if self.quantities[index] == 0 {
            self.item_ids[index] = 0;
        }

        Ok(())
    }
}

#[error_code]
pub enum InventoryError {
    #[msg("Inventory does not have an empty slot.")]
    InventoryFull,
    #[msg("Inventory item quantity overflowed.")]
    QuantityOverflow,
    #[msg("Inventory item is missing.")]
    ItemMissing,
    #[msg("Inventory item quantity is too low.")]
    NotEnoughItems,
}
