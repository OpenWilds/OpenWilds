use bolt_lang::*;
use inventory::Inventory;
use open_wilds::{TradeAcceptance, TradeOffer, TradeStatus};
use player_owner::PlayerOwner;
use position::Position;
use serde::Deserialize;

declare_id!("HqHfwh69PtpM1mvBzHXbqNMLxD2kkygikMbmqYVPFqvv");

const TRADE_RANGE: u64 = 1;

#[system]
pub mod accept_trade {
    pub fn execute(ctx: Context<Components>, args: Vec<u8>) -> Result<Components> {
        let args: AcceptTradeArgs =
            serde_json::from_slice(&args).map_err(|_| error!(AcceptTradeError::InvalidArgs))?;
        let buyer = ctx.accounts.authority.key();
        let now = Clock::get()?.unix_timestamp;

        require!(
            is_player_authority(
                &ctx.accounts.buyer_owner,
                buyer,
                &[
                    ctx.accounts.buyer_position.bolt_metadata.authority,
                    ctx.accounts.buyer_inventory.bolt_metadata.authority,
                ],
            ),
            AcceptTradeError::InvalidBuyerAuthority
        );
        require!(
            ctx.accounts.seller_owner.bolt_metadata.authority == ctx.accounts.seller_owner.owner,
            AcceptTradeError::InvalidSellerAuthority
        );
        require!(
            ctx.accounts.seller_position.bolt_metadata.authority == ctx.accounts.seller_owner.owner
                && ctx.accounts.seller_inventory.bolt_metadata.authority
                    == ctx.accounts.seller_owner.owner,
            AcceptTradeError::InvalidSellerAuthority
        );

        let trade_offer_key = pubkey_from_bytes(args.trade_offer)?;
        let trade_acceptance_key = pubkey_from_bytes(args.trade_acceptance)?;

        let trade_offer_info = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == trade_offer_key)
            .ok_or(error!(AcceptTradeError::MissingValidationAccount))?;
        let trade_acceptance_info = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == trade_acceptance_key)
            .ok_or(error!(AcceptTradeError::MissingValidationAccount))?;
        let instruction_sysvar_info = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == bolt_lang::solana_program::sysvar::instructions::id())
            .ok_or(error!(AcceptTradeError::MissingValidationAccount))?;

        require_keys_eq!(
            *trade_offer_info.owner,
            open_wilds::ID,
            AcceptTradeError::InvalidOpenWildsAccount
        );
        require_keys_eq!(
            *trade_acceptance_info.owner,
            open_wilds::ID,
            AcceptTradeError::InvalidOpenWildsAccount
        );

        let trade_offer = deserialize_open_wilds_account::<TradeOffer>(&trade_offer_info)?;
        let trade_acceptance =
            deserialize_open_wilds_account::<TradeAcceptance>(&trade_acceptance_info)?;

        require!(
            trade_offer.status == TradeStatus::Accepted,
            AcceptTradeError::TradeOfferNotAccepted
        );
        require!(
            trade_offer.expires_at > now,
            AcceptTradeError::TradeOfferExpired
        );
        require_keys_eq!(
            trade_offer.buyer,
            buyer,
            AcceptTradeError::InvalidTradeBuyer
        );
        require_keys_eq!(
            trade_offer.seller,
            ctx.accounts.seller_owner.owner,
            AcceptTradeError::InvalidTradeSeller
        );
        require_keys_eq!(
            trade_offer.buyer_player_mint,
            ctx.accounts.buyer_owner.player_mint,
            AcceptTradeError::InvalidPlayerMint
        );
        require_keys_eq!(
            trade_offer.seller_player_mint,
            ctx.accounts.seller_owner.player_mint,
            AcceptTradeError::InvalidPlayerMint
        );
        require_keys_eq!(
            trade_acceptance.offer,
            trade_offer_info.key(),
            AcceptTradeError::InvalidTradeAcceptance
        );
        require_keys_eq!(
            trade_acceptance.seller,
            trade_offer.seller,
            AcceptTradeError::InvalidTradeAcceptance
        );
        require!(
            players_are_in_range(&ctx.accounts.buyer_position, &ctx.accounts.seller_position),
            AcceptTradeError::PlayersOutOfRange
        );
        require!(
            ctx.accounts.seller_inventory.quantity(trade_offer.item_id)
                >= trade_offer.item_quantity,
            AcceptTradeError::SellerMissingItems
        );

        require_finalize_instruction(
            &instruction_sysvar_info,
            trade_offer_info.key(),
            trade_acceptance_info.key(),
        )?;

        ctx.accounts
            .seller_inventory
            .remove_item(trade_offer.item_id, trade_offer.item_quantity)?;
        ctx.accounts
            .buyer_inventory
            .add_item(trade_offer.item_id, trade_offer.item_quantity)?;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub buyer_owner: PlayerOwner,
        pub buyer_position: Position,
        pub buyer_inventory: Inventory,
        pub seller_owner: PlayerOwner,
        pub seller_position: Position,
        pub seller_inventory: Inventory,
    }
}

#[derive(Deserialize)]
struct AcceptTradeArgs {
    trade_offer: [u8; 32],
    trade_acceptance: [u8; 32],
}

fn pubkey_from_bytes(bytes: [u8; 32]) -> Result<Pubkey> {
    Pubkey::try_from(bytes.as_slice()).map_err(|_| error!(AcceptTradeError::InvalidArgs))
}

fn is_player_authority(
    player_owner: &PlayerOwner,
    signer: Pubkey,
    component_authorities: &[Pubkey],
) -> bool {
    player_owner.owner == signer
        && component_authorities
            .iter()
            .all(|component_authority| *component_authority == signer)
}

fn players_are_in_range(buyer: &Position, seller: &Position) -> bool {
    buyer.x.abs_diff(seller.x) <= TRADE_RANGE && buyer.y.abs_diff(seller.y) <= TRADE_RANGE
}

fn deserialize_open_wilds_account<T: AccountDeserialize>(account: &AccountInfo) -> Result<T> {
    let data = account.try_borrow_data()?;
    let mut data_ref: &[u8] = &data;
    T::try_deserialize(&mut data_ref).map_err(|_| error!(AcceptTradeError::InvalidOpenWildsAccount))
}

fn require_finalize_instruction(
    instruction_sysvar: &AccountInfo,
    trade_offer: Pubkey,
    trade_acceptance: Pubkey,
) -> Result<()> {
    let current_index = bolt_lang::solana_program::sysvar::instructions::load_current_index_checked(
        instruction_sysvar,
    )? as usize;
    let finalize_discriminator = [176, 17, 211, 160, 82, 107, 250, 93];
    let mut index = current_index + 1;

    loop {
        let instruction =
            match bolt_lang::solana_program::sysvar::instructions::load_instruction_at_checked(
                index,
                instruction_sysvar,
            ) {
                Ok(instruction) => instruction,
                Err(_) => break,
            };

        if instruction.program_id == open_wilds::ID
            && instruction.data.len() >= 8
            && instruction.data[..8] == finalize_discriminator
            && instruction
                .accounts
                .iter()
                .any(|meta| meta.pubkey == trade_offer)
            && instruction
                .accounts
                .iter()
                .any(|meta| meta.pubkey == trade_acceptance)
        {
            return Ok(());
        }

        index += 1;
    }

    err!(AcceptTradeError::MissingFinalizeInstruction)
}

#[error_code]
pub enum AcceptTradeError {
    #[msg("Accept trade expected JSON args with trade and token account pubkeys.")]
    InvalidArgs,
    #[msg("Buyer components must belong to the transaction authority.")]
    InvalidBuyerAuthority,
    #[msg("Seller components must belong to the seller recorded in player owner.")]
    InvalidSellerAuthority,
    #[msg("A required validation account is missing.")]
    MissingValidationAccount,
    #[msg("Expected an Open Wilds account.")]
    InvalidOpenWildsAccount,
    #[msg("Trade offer is not accepted.")]
    TradeOfferNotAccepted,
    #[msg("Trade offer has expired.")]
    TradeOfferExpired,
    #[msg("Signer is not the trade buyer.")]
    InvalidTradeBuyer,
    #[msg("Trade seller does not match the offer.")]
    InvalidTradeSeller,
    #[msg("Player mint does not match the offer.")]
    InvalidPlayerMint,
    #[msg("Trade acceptance does not match the offer.")]
    InvalidTradeAcceptance,
    #[msg("Players must be on neighboring tiles to trade.")]
    PlayersOutOfRange,
    #[msg("Seller does not have enough of the requested item.")]
    SellerMissingItems,
    #[msg("The same transaction must finalize the trade offer after accept_trade.")]
    MissingFinalizeInstruction,
}
