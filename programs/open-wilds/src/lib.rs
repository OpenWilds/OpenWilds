use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use bolt_lang::prelude::*;
use player_owner::PlayerOwner;

declare_id!("Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6");

pub const GOLD_CONFIG_SEED: &[u8] = b"gold-config";
pub const GOLD_MINT_SEED: &[u8] = b"gold-mint";
pub const GOLD_MINT_AUTHORITY_SEED: &[u8] = b"gold-mint-authority";
pub const PLAYER_GOLD_AUTHORITY_SEED: &[u8] = b"player-gold-authority";
pub const PLAYER_NFT_REGISTRATION_SEED: &[u8] = b"player-nft";
pub const PLAYER_SESSION_SEED: &[u8] = b"player-session";
pub const STARTER_GOLD_CLAIM_SEED: &[u8] = b"starter-gold-claim-v2";
pub const TRADE_OFFER_SEED: &[u8] = b"trade-offer";
pub const TRADE_ACCEPTANCE_SEED: &[u8] = b"trade-acceptance";
pub const DEFAULT_STARTER_GOLD: u64 = 100;
pub const DEFAULT_GOLD_DECIMALS: u8 = 0;
pub const PLAYER_SESSION_SCOPE_MOVE: u32 = 1 << 0;
pub const PLAYER_SESSION_SCOPE_SLEEP: u32 = 1 << 1;
pub const PLAYER_SESSION_SCOPE_FARM: u32 = 1 << 2;
pub const PLAYER_SESSION_SCOPE_HARVEST: u32 = 1 << 3;
pub const PLAYER_SESSION_SCOPE_INVENTORY: u32 = 1 << 4;
pub const PLAYER_SESSION_SCOPE_TRADE: u32 = 1 << 5;
pub const PLAYER_SESSION_SCOPE_SPEND: u32 = 1 << 6;
pub const PLAYER_SESSION_SCOPE_ALL: u32 = PLAYER_SESSION_SCOPE_MOVE
    | PLAYER_SESSION_SCOPE_SLEEP
    | PLAYER_SESSION_SCOPE_FARM
    | PLAYER_SESSION_SCOPE_HARVEST
    | PLAYER_SESSION_SCOPE_INVENTORY
    | PLAYER_SESSION_SCOPE_TRADE
    | PLAYER_SESSION_SCOPE_SPEND;

#[program]
pub mod open_wilds {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn initialize_gold_config(
        ctx: Context<InitializeGoldConfig>,
        starter_amount: u64,
        decimals: u8,
    ) -> Result<()> {
        require!(
            decimals == DEFAULT_GOLD_DECIMALS,
            OpenWildsError::InvalidGoldDecimals
        );
        require!(starter_amount > 0, OpenWildsError::InvalidStarterGoldAmount);

        let config = &mut ctx.accounts.gold_config;
        config.admin = ctx.accounts.admin.key();
        config.gold_mint = ctx.accounts.gold_mint.key();
        config.mint_authority = ctx.accounts.mint_authority.key();
        config.starter_amount = starter_amount;
        config.decimals = decimals;
        config.bump = ctx.bumps.gold_config;
        config.mint_bump = ctx.bumps.gold_mint;
        config.mint_authority_bump = ctx.bumps.mint_authority;

        Ok(())
    }

    pub fn claim_starter_gold(ctx: Context<ClaimStarterGold>, player_mint: Pubkey) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.player_owner.owner,
            ctx.accounts.owner.key(),
            OpenWildsError::InvalidPlayerOwner
        );
        require_keys_eq!(
            ctx.accounts.player_owner.player_mint,
            player_mint,
            OpenWildsError::InvalidPlayerMint
        );

        let seeds = &[
            GOLD_MINT_AUTHORITY_SEED,
            &[ctx.accounts.gold_config.mint_authority_bump],
        ];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.gold_mint.to_account_info(),
                    to: ctx.accounts.player_gold_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer,
            ),
            ctx.accounts.gold_config.starter_amount,
        )?;

        let claim = &mut ctx.accounts.starter_gold_claim;
        claim.owner = ctx.accounts.owner.key();
        claim.player_mint = player_mint;
        claim.claimed_at = Clock::get()?.unix_timestamp;
        claim.bump = ctx.bumps.starter_gold_claim;

        Ok(())
    }

    pub fn register_player_nft(
        ctx: Context<RegisterPlayerNft>,
        color_id: [u8; 16],
        name: [u8; 32],
        symbol: [u8; 10],
    ) -> Result<()> {
        require!(
            ctx.accounts.player_mint.decimals == 0,
            OpenWildsError::InvalidPlayerNft
        );
        require!(
            ctx.accounts.player_mint.supply == 1,
            OpenWildsError::InvalidPlayerNft
        );
        require_keys_eq!(
            ctx.accounts.owner_token_account.owner,
            ctx.accounts.owner.key(),
            OpenWildsError::InvalidPlayerOwner
        );
        require_keys_eq!(
            ctx.accounts.owner_token_account.mint,
            ctx.accounts.player_mint.key(),
            OpenWildsError::InvalidPlayerMint
        );
        require!(
            ctx.accounts.owner_token_account.amount == 1,
            OpenWildsError::InvalidPlayerNft
        );

        let registration = &mut ctx.accounts.player_nft_registration;
        registration.player_mint = ctx.accounts.player_mint.key();
        registration.creator = ctx.accounts.owner.key();
        registration.created_at = Clock::get()?.unix_timestamp;
        registration.color_id = color_id;
        registration.name = name;
        registration.symbol = symbol;
        registration.bump = ctx.bumps.player_nft_registration;

        Ok(())
    }

    pub fn grant_player_session(
        ctx: Context<GrantPlayerSession>,
        delegate: Pubkey,
        scopes: u32,
    ) -> Result<()> {
        require!(
            scopes & !PLAYER_SESSION_SCOPE_ALL == 0,
            OpenWildsError::InvalidPlayerSessionScope
        );
        require!(scopes != 0, OpenWildsError::InvalidPlayerSessionScope);
        require_player_nft_owner(
            &ctx.accounts.owner,
            &ctx.accounts.player_mint,
            &ctx.accounts.owner_token_account,
        )?;

        let session = &mut ctx.accounts.player_session;
        session.player_mint = ctx.accounts.player_mint.key();
        session.owner = ctx.accounts.owner.key();
        session.delegate = delegate;
        session.scopes = scopes;
        session.revoked = false;
        session.created_at = Clock::get()?.unix_timestamp;
        session.bump = ctx.bumps.player_session;

        Ok(())
    }

    pub fn revoke_player_session(
        ctx: Context<RevokePlayerSession>,
        _delegate: Pubkey,
    ) -> Result<()> {
        require_player_nft_owner(
            &ctx.accounts.owner,
            &ctx.accounts.player_mint,
            &ctx.accounts.owner_token_account,
        )?;

        Ok(())
    }

    pub fn create_trade_offer(
        ctx: Context<CreateTradeOffer>,
        offer_id: u64,
        seller_player_mint: Pubkey,
        buyer_entity: Pubkey,
        seller_entity: Pubkey,
        item_id: u16,
        item_quantity: u16,
        gold_amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(item_id != 0, OpenWildsError::InvalidTradeItem);
        require!(item_quantity != 0, OpenWildsError::InvalidTradeItem);
        require!(gold_amount != 0, OpenWildsError::InvalidGoldAmount);
        require!(
            expires_at > Clock::get()?.unix_timestamp,
            OpenWildsError::TradeOfferExpired
        );
        require_keys_eq!(
            ctx.accounts.buyer_player_owner.owner,
            ctx.accounts.buyer.key(),
            OpenWildsError::InvalidPlayerOwner
        );

        let offer = &mut ctx.accounts.trade_offer;
        offer.offer_id = offer_id;
        offer.buyer = ctx.accounts.buyer.key();
        offer.seller = ctx.accounts.seller.key();
        offer.buyer_player_mint = ctx.accounts.buyer_player_owner.player_mint;
        offer.seller_player_mint = seller_player_mint;
        offer.buyer_entity = buyer_entity;
        offer.seller_entity = seller_entity;
        offer.gold_mint = ctx.accounts.gold_config.gold_mint;
        offer.item_id = item_id;
        offer.item_quantity = item_quantity;
        offer.gold_amount = gold_amount;
        offer.expires_at = expires_at;
        offer.status = TradeStatus::Open;
        offer.bump = ctx.bumps.trade_offer;

        Ok(())
    }

    pub fn accept_trade_offer(ctx: Context<AcceptTradeOffer>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let offer = &mut ctx.accounts.trade_offer;

        require!(
            offer.status == TradeStatus::Open,
            OpenWildsError::TradeOfferNotOpen
        );
        require!(offer.expires_at > now, OpenWildsError::TradeOfferExpired);
        require_keys_eq!(
            offer.seller,
            ctx.accounts.seller.key(),
            OpenWildsError::InvalidTradeSeller
        );
        require_keys_eq!(
            offer.seller_player_mint,
            ctx.accounts.seller_player_owner.player_mint,
            OpenWildsError::InvalidPlayerMint
        );
        require_keys_eq!(
            ctx.accounts.seller_player_owner.owner,
            ctx.accounts.seller.key(),
            OpenWildsError::InvalidPlayerOwner
        );

        offer.status = TradeStatus::Accepted;

        let acceptance = &mut ctx.accounts.trade_acceptance;
        acceptance.offer = offer.key();
        acceptance.seller = ctx.accounts.seller.key();
        acceptance.accepted_at = now;
        acceptance.bump = ctx.bumps.trade_acceptance;

        Ok(())
    }

    pub fn cancel_trade_offer(ctx: Context<CancelTradeOffer>) -> Result<()> {
        require!(
            ctx.accounts.trade_offer.status != TradeStatus::Finalized,
            OpenWildsError::TradeOfferFinalized
        );
        Ok(())
    }

    pub fn finalize_trade_offer(ctx: Context<FinalizeTradeOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.trade_offer;
        require!(
            offer.status == TradeStatus::Accepted,
            OpenWildsError::TradeOfferNotAccepted
        );
        require_keys_eq!(
            offer.gold_mint,
            ctx.accounts.gold_config.gold_mint,
            OpenWildsError::InvalidGoldMint
        );
        require_keys_eq!(
            ctx.accounts.buyer_player_owner.owner,
            ctx.accounts.buyer.key(),
            OpenWildsError::InvalidPlayerOwner
        );
        require_keys_eq!(
            ctx.accounts.buyer_player_owner.player_mint,
            offer.buyer_player_mint,
            OpenWildsError::InvalidPlayerMint
        );
        require_keys_eq!(
            ctx.accounts.seller_player_owner.owner,
            offer.seller,
            OpenWildsError::InvalidPlayerOwner
        );
        require_keys_eq!(
            ctx.accounts.seller_player_owner.player_mint,
            offer.seller_player_mint,
            OpenWildsError::InvalidPlayerMint
        );
        require_keys_eq!(
            ctx.accounts.trade_acceptance.offer,
            offer.key(),
            OpenWildsError::InvalidTradeAcceptance
        );
        require_keys_eq!(
            ctx.accounts.trade_acceptance.seller,
            offer.seller,
            OpenWildsError::InvalidTradeAcceptance
        );
        require_keys_eq!(
            ctx.accounts.buyer_gold_account.mint,
            ctx.accounts.gold_config.gold_mint,
            OpenWildsError::InvalidGoldMint
        );
        require_keys_eq!(
            ctx.accounts.seller_gold_account.mint,
            ctx.accounts.gold_config.gold_mint,
            OpenWildsError::InvalidGoldMint
        );
        require_keys_eq!(
            ctx.accounts.buyer_gold_account.owner,
            ctx.accounts.buyer_gold_authority.key(),
            OpenWildsError::InvalidTradeBuyer
        );
        require_keys_eq!(
            ctx.accounts.seller_gold_account.owner,
            ctx.accounts.seller_gold_authority.key(),
            OpenWildsError::InvalidTradeSeller
        );

        let buyer_player_mint = offer.buyer_player_mint;
        let seeds = &[
            PLAYER_GOLD_AUTHORITY_SEED,
            buyer_player_mint.as_ref(),
            &[ctx.bumps.buyer_gold_authority],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_gold_account.to_account_info(),
                    to: ctx.accounts.seller_gold_account.to_account_info(),
                    authority: ctx.accounts.buyer_gold_authority.to_account_info(),
                },
                signer,
            ),
            offer.gold_amount,
        )?;

        offer.status = TradeStatus::Finalized;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(starter_amount: u64, decimals: u8)]
pub struct InitializeGoldConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = GoldConfig::SPACE,
        seeds = [GOLD_CONFIG_SEED],
        bump
    )]
    pub gold_config: Account<'info, GoldConfig>,
    #[account(
        init,
        payer = admin,
        seeds = [GOLD_MINT_SEED],
        bump,
        mint::decimals = decimals,
        mint::authority = mint_authority
    )]
    pub gold_mint: Account<'info, Mint>,
    /// CHECK: PDA mint authority; only used as a signer through seeds.
    #[account(seeds = [GOLD_MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(player_mint: Pubkey)]
pub struct ClaimStarterGold<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [GOLD_CONFIG_SEED], bump = gold_config.bump)]
    pub gold_config: Account<'info, GoldConfig>,
    #[account(
        init,
        payer = owner,
        space = StarterGoldClaim::SPACE,
        seeds = [STARTER_GOLD_CLAIM_SEED, player_mint.as_ref()],
        bump
    )]
    pub starter_gold_claim: Account<'info, StarterGoldClaim>,
    #[account(mut, address = gold_config.gold_mint)]
    pub gold_mint: Account<'info, Mint>,
    /// CHECK: PDA mint authority; only used as a signer through seeds.
    #[account(seeds = [GOLD_MINT_AUTHORITY_SEED], bump = gold_config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: PDA authority for the player's Gold token account.
    #[account(seeds = [PLAYER_GOLD_AUTHORITY_SEED, player_mint.as_ref()], bump)]
    pub player_gold_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = gold_mint,
        associated_token::authority = player_gold_authority
    )]
    pub player_gold_account: Account<'info, TokenAccount>,
    pub player_owner: Account<'info, PlayerOwner>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterPlayerNft<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub player_mint: Account<'info, Mint>,
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = PlayerNftRegistration::SPACE,
        seeds = [PLAYER_NFT_REGISTRATION_SEED, player_mint.key().as_ref()],
        bump
    )]
    pub player_nft_registration: Account<'info, PlayerNftRegistration>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct GrantPlayerSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub player_mint: Account<'info, Mint>,
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = PlayerSession::SPACE,
        seeds = [
            PLAYER_SESSION_SEED,
            player_mint.key().as_ref(),
            owner.key().as_ref(),
            delegate.as_ref()
        ],
        bump
    )]
    pub player_session: Account<'info, PlayerSession>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct RevokePlayerSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub player_mint: Account<'info, Mint>,
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        close = owner,
        seeds = [
            PLAYER_SESSION_SEED,
            player_mint.key().as_ref(),
            owner.key().as_ref(),
            delegate.as_ref()
        ],
        bump = player_session.bump
    )]
    pub player_session: Account<'info, PlayerSession>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateTradeOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Seller wallet target stored on the offer.
    pub seller: UncheckedAccount<'info>,
    #[account(seeds = [GOLD_CONFIG_SEED], bump = gold_config.bump)]
    pub gold_config: Account<'info, GoldConfig>,
    pub buyer_player_owner: Account<'info, PlayerOwner>,
    #[account(
        init,
        payer = buyer,
        space = TradeOffer::SPACE,
        seeds = [TRADE_OFFER_SEED, buyer.key().as_ref(), &offer_id.to_le_bytes()],
        bump
    )]
    pub trade_offer: Account<'info, TradeOffer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptTradeOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    pub seller_player_owner: Account<'info, PlayerOwner>,
    #[account(mut)]
    pub trade_offer: Account<'info, TradeOffer>,
    #[account(
        init,
        payer = seller,
        space = TradeAcceptance::SPACE,
        seeds = [TRADE_ACCEPTANCE_SEED, trade_offer.key().as_ref()],
        bump
    )]
    pub trade_acceptance: Account<'info, TradeAcceptance>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelTradeOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        close = buyer,
        constraint = trade_offer.buyer == buyer.key() @ OpenWildsError::InvalidTradeBuyer
    )]
    pub trade_offer: Account<'info, TradeOffer>,
}

#[derive(Accounts)]
pub struct FinalizeTradeOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [GOLD_CONFIG_SEED], bump = gold_config.bump)]
    pub gold_config: Account<'info, GoldConfig>,
    #[account(
        mut,
        constraint = trade_offer.buyer == buyer.key() @ OpenWildsError::InvalidTradeBuyer
    )]
    pub trade_offer: Account<'info, TradeOffer>,
    #[account(seeds = [TRADE_ACCEPTANCE_SEED, trade_offer.key().as_ref()], bump = trade_acceptance.bump)]
    pub trade_acceptance: Account<'info, TradeAcceptance>,
    pub buyer_player_owner: Account<'info, PlayerOwner>,
    pub seller_player_owner: Account<'info, PlayerOwner>,
    /// CHECK: PDA authority for the buyer player's Gold token account.
    #[account(seeds = [PLAYER_GOLD_AUTHORITY_SEED, trade_offer.buyer_player_mint.as_ref()], bump)]
    pub buyer_gold_authority: UncheckedAccount<'info>,
    /// CHECK: PDA authority for the seller player's Gold token account.
    #[account(seeds = [PLAYER_GOLD_AUTHORITY_SEED, trade_offer.seller_player_mint.as_ref()], bump)]
    pub seller_gold_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer_gold_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_gold_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GoldConfig {
    pub admin: Pubkey,
    pub gold_mint: Pubkey,
    pub mint_authority: Pubkey,
    pub starter_amount: u64,
    pub decimals: u8,
    pub bump: u8,
    pub mint_bump: u8,
    pub mint_authority_bump: u8,
}

impl GoldConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 1;
}

#[account]
pub struct StarterGoldClaim {
    pub owner: Pubkey,
    pub player_mint: Pubkey,
    pub claimed_at: i64,
    pub bump: u8,
}

impl StarterGoldClaim {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct PlayerNftRegistration {
    pub player_mint: Pubkey,
    pub creator: Pubkey,
    pub created_at: i64,
    pub color_id: [u8; 16],
    pub name: [u8; 32],
    pub symbol: [u8; 10],
    pub bump: u8,
}

impl PlayerNftRegistration {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 16 + 32 + 10 + 1;
}

#[account]
pub struct PlayerSession {
    pub player_mint: Pubkey,
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub scopes: u32,
    pub revoked: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl PlayerSession {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 4 + 1 + 8 + 1;
}

pub fn has_valid_player_session(
    player_mint: Pubkey,
    owner: Pubkey,
    signer: Pubkey,
    required_scope: u32,
    remaining_accounts: &[AccountInfo],
) -> bool {
    remaining_accounts.iter().any(|account| {
        if *account.owner != ID {
            return false;
        }

        let expected = Pubkey::find_program_address(
            &[
                PLAYER_SESSION_SEED,
                player_mint.as_ref(),
                owner.as_ref(),
                signer.as_ref(),
            ],
            &ID,
        )
        .0;

        if account.key() != expected {
            return false;
        }

        let data = match account.try_borrow_data() {
            Ok(data) => data,
            Err(_) => return false,
        };
        let mut data_ref: &[u8] = &data;
        let session = match PlayerSession::try_deserialize(&mut data_ref) {
            Ok(session) => session,
            Err(_) => return false,
        };

        session.player_mint == player_mint
            && session.owner == owner
            && session.delegate == signer
            && !session.revoked
            && session.scopes & required_scope == required_scope
    })
}

#[account]
pub struct TradeOffer {
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub buyer_player_mint: Pubkey,
    pub seller_player_mint: Pubkey,
    pub buyer_entity: Pubkey,
    pub seller_entity: Pubkey,
    pub gold_mint: Pubkey,
    pub item_id: u16,
    pub item_quantity: u16,
    pub gold_amount: u64,
    pub expires_at: i64,
    pub status: TradeStatus,
    pub bump: u8,
}

impl TradeOffer {
    pub const SPACE: usize = 8 + 8 + (32 * 7) + 2 + 2 + 8 + 8 + 1 + 1;
}

#[account]
pub struct TradeAcceptance {
    pub offer: Pubkey,
    pub seller: Pubkey,
    pub accepted_at: i64,
    pub bump: u8,
}

impl TradeAcceptance {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TradeStatus {
    Open,
    Accepted,
    Finalized,
}

#[error_code]
pub enum OpenWildsError {
    #[msg("Gold decimals must be zero for v1 Gold.")]
    InvalidGoldDecimals,
    #[msg("Starter Gold amount must be positive.")]
    InvalidStarterGoldAmount,
    #[msg("Player owner component does not belong to the signer.")]
    InvalidPlayerOwner,
    #[msg("Player mint does not match the player owner component.")]
    InvalidPlayerMint,
    #[msg("Trade item id and quantity must be non-zero.")]
    InvalidTradeItem,
    #[msg("Gold amount must be non-zero.")]
    InvalidGoldAmount,
    #[msg("Trade does not use the configured Gold mint.")]
    InvalidGoldMint,
    #[msg("Trade offer has expired.")]
    TradeOfferExpired,
    #[msg("Trade offer is not open.")]
    TradeOfferNotOpen,
    #[msg("Trade offer is not accepted.")]
    TradeOfferNotAccepted,
    #[msg("Trade offer has already been finalized.")]
    TradeOfferFinalized,
    #[msg("Signer is not the trade buyer.")]
    InvalidTradeBuyer,
    #[msg("Signer is not the trade seller.")]
    InvalidTradeSeller,
    #[msg("Trade acceptance does not match the offer.")]
    InvalidTradeAcceptance,
    #[msg("Player NFT must be a one-of-one SPL token owned by the signer.")]
    InvalidPlayerNft,
    #[msg("Player session scope is invalid.")]
    InvalidPlayerSessionScope,
}

fn require_player_nft_owner(
    owner: &Signer,
    player_mint: &Account<Mint>,
    owner_token_account: &Account<TokenAccount>,
) -> Result<()> {
    require!(
        player_mint.decimals == 0 && player_mint.supply == 1,
        OpenWildsError::InvalidPlayerNft
    );
    require_keys_eq!(
        owner_token_account.owner,
        owner.key(),
        OpenWildsError::InvalidPlayerOwner
    );
    require_keys_eq!(
        owner_token_account.mint,
        player_mint.key(),
        OpenWildsError::InvalidPlayerMint
    );
    require!(
        owner_token_account.amount == 1,
        OpenWildsError::InvalidPlayerNft
    );

    Ok(())
}
