use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::associated_token::spl_associated_token_account;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::FractachainError;
use crate::events::*;
use crate::state::*;
use crate::token_ix::*;

/* --------------------------------------------------------- create offering */

#[derive(Accounts)]
#[instruction(listing_seed: [u8; 32])]
pub struct CreateOffering<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        init,
        payer = admin,
        space = 8 + Offering::INIT_SPACE,
        seeds = [OFFERING_SEED, listing_seed.as_ref()],
        bump,
    )]
    pub offering: Account<'info, Offering>,
    /// CHECK: created by CPI in the handler (Token-2022 + extensions).
    #[account(
        mut,
        seeds = [RWA_MINT_SEED, offering.key().as_ref()],
        bump,
    )]
    pub rwa_mint: UncheckedAccount<'info>,
    /// CHECK: ATA(Offering, rwa_mint) — created + thawed by CPI in the handler.
    #[account(mut)]
    pub treasury_ata: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[allow(clippy::too_many_arguments)]
pub fn create_offering(
    ctx: Context<CreateOffering>,
    listing_seed: [u8; 32],
    legal_info: LegalInfo,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let offering = &mut ctx.accounts.offering;
    offering.listing_seed = listing_seed;
    offering.admin = ctx.accounts.admin.key();
    offering.fiduciary = Pubkey::default();
    offering.payment_mint = Pubkey::default();
    offering.payment_kind = PaymentKind::Usdc;
    offering.rwa_mint = ctx.accounts.rwa_mint.key();
    offering.treasury_ata = ctx.accounts.treasury_ata.key();
    offering.escrow_ata = Pubkey::default();
    offering.soft_cap = 0;
    offering.hard_cap = 0;
    offering.deadline = 0;
    offering.price_per_unit = 0;
    offering.total_raised = 0;
    offering.units_minted = 0;
    offering.units_sold = 0;
    offering.cv_deposit_hash = [0u8; 32];
    offering.state = OfferingState::Draft;
    offering.legal_info = legal_info;
    offering.proceeds_withdrawn = false;
    offering.highest_price = 0;
    offering.squeeze_price = 0;
    offering.product_id = 0;
    offering.bump = ctx.bumps.offering;
    offering.mint_bump = ctx.bumps.rwa_mint;

    let offering_key = offering.key();
    let mint_seeds: &[&[u8]] = &[
        RWA_MINT_SEED,
        offering_key.as_ref(),
        &[offering.mint_bump],
    ];
    let offering_seeds: &[&[u8]] = &[
        OFFERING_SEED,
        offering.listing_seed.as_ref(),
        &[offering.bump],
    ];

    // Token-2022 mint: frozen-by-default + permanent delegate + metadata.
    create_rwa_mint(
        &ctx.accounts.admin.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        mint_seeds,
        offering_seeds,
        &ctx.accounts.rent.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.token_2022_program.to_account_info(),
        name,
        symbol,
        uri,
    )?;

    // Treasury ATA owned by the Offering PDA. ATAs may have off-curve owners.
    let expected_treasury = get_associated_token_address_with_program_id(
        &offering_key,
        &ctx.accounts.rwa_mint.key(),
        &spl_token_2022::ID,
    );
    require_keys_eq!(
        ctx.accounts.treasury_ata.key(),
        expected_treasury,
        FractachainError::InvalidAddress
    );
    invoke(
        &spl_associated_token_account::instruction::create_associated_token_account(
            &ctx.accounts.admin.key(),
            &offering_key,
            &ctx.accounts.rwa_mint.key(),
            &spl_token_2022::ID,
        ),
        &[
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.treasury_ata.to_account_info(),
            offering.to_account_info(),
            ctx.accounts.rwa_mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
    )?;
    // DefaultAccountState=Frozen → the float must be thawed or mint_to fails.
    thaw(
        &ctx.accounts.treasury_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        offering_seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
    )?;

    emit!(OfferingCreated {
        offering: offering_key,
        rwa_mint: offering.rwa_mint,
        product_id: 0,
    });
    Ok(())
}

/* ------------------------------------------------------------- mint supply */

#[derive(Accounts)]
pub struct MintSupply<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
        constraint = offering.state == OfferingState::Draft @ FractachainError::NotDraft,
    )]
    pub offering: Account<'info, Offering>,
    #[account(
        mut,
        address = offering.rwa_mint,
    )]
    pub rwa_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        address = offering.treasury_ata,
        token::mint = rwa_mint,
    )]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
}

pub fn mint_supply(ctx: Context<MintSupply>, amount: u64, cv_deposit_hash: [u8; 32]) -> Result<()> {
    require!(amount > 0, FractachainError::NotPositive);
    let offering = &mut ctx.accounts.offering;
    let seeds: &[&[u8]] = &offering_signer(offering);
    mint_to_offering(
        &ctx.accounts.rwa_mint.to_account_info(),
        &ctx.accounts.treasury_ata.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
        amount,
    )?;
    offering.units_minted = offering
        .units_minted
        .checked_add(amount)
        .ok_or(FractachainError::Overflow)?;
    offering.cv_deposit_hash = cv_deposit_hash;
    offering.state = OfferingState::Minted;
    emit!(SupplyMinted {
        offering: offering.key(),
        seq: offering.units_minted,
        amount,
        cv_deposit_hash,
    });
    Ok(())
}

/* ------------------------------------------------------------- open offering */

#[derive(Accounts)]
pub struct OpenOffering<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
        constraint = offering.state == OfferingState::Minted @ FractachainError::NotMinted,
    )]
    pub offering: Account<'info, Offering>,
    /// CHECK: verified against the platform allowlist in the handler.
    pub payment_mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = payment_mint,
        associated_token::authority = offering,
        associated_token::token_program = payment_token_program,
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn open_offering(
    ctx: Context<OpenOffering>,
    fiduciary: Pubkey,
    soft_cap: u64,
    hard_cap: u64,
    deadline: i64,
    price_per_unit: u64,
) -> Result<()> {
    let payment_mint = ctx.accounts.payment_mint.key();
    let platform = &mut ctx.accounts.platform;
    let kind = if payment_mint == platform.usdc_mint {
        PaymentKind::Usdc
    } else if platform.usdt_mint == Some(payment_mint) {
        PaymentKind::Usdt
    } else {
        return Err(FractachainError::PaymentMintNotAllowed.into());
    };
    require!(soft_cap > 0 && hard_cap > 0 && price_per_unit > 0, FractachainError::NotPositive);
    require!(hard_cap >= soft_cap, FractachainError::BadCaps);
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, FractachainError::DeadlineInPast);

    let offering = &mut ctx.accounts.offering;
    offering.fiduciary = fiduciary;
    offering.payment_mint = payment_mint;
    offering.payment_kind = kind;
    offering.escrow_ata = ctx.accounts.escrow_ata.key();
    offering.soft_cap = soft_cap;
    offering.hard_cap = hard_cap;
    offering.deadline = deadline;
    offering.price_per_unit = price_per_unit;
    offering.highest_price = price_per_unit;
    platform.product_count += 1;
    offering.product_id = platform.product_count;
    offering.state = OfferingState::Open;

    emit!(OfferingOpened {
        offering: offering.key(),
        price_per_unit,
        hard_cap,
        deadline,
    });
    Ok(())
}

/* ---------------------------------------------------------------- setters */

#[derive(Accounts)]
pub struct UpdateOffering<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
        constraint = offering.total_raised == 0 @ FractachainError::ContributionsStarted,
    )]
    pub offering: Account<'info, Offering>,
}

pub fn set_fiduciary(ctx: Context<UpdateOffering>, fiduciary: Pubkey) -> Result<()> {
    ctx.accounts.offering.fiduciary = fiduciary;
    Ok(())
}

pub fn set_price_per_unit(ctx: Context<UpdateOffering>, price_per_unit: u64) -> Result<()> {
    require!(price_per_unit > 0, FractachainError::NotPositive);
    ctx.accounts.offering.price_per_unit = price_per_unit;
    Ok(())
}

#[derive(Accounts)]
pub struct SetOfferingPaymentMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
        constraint = offering.total_raised == 0 @ FractachainError::ContributionsStarted,
    )]
    pub offering: Account<'info, Offering>,
    /// CHECK: verified against the platform allowlist in the handler.
    pub payment_mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = payment_mint,
        associated_token::authority = offering,
        associated_token::token_program = payment_token_program,
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn set_offering_payment_mint(ctx: Context<SetOfferingPaymentMint>) -> Result<()> {
    let mint = ctx.accounts.payment_mint.key();
    let platform = &ctx.accounts.platform;
    let kind = if mint == platform.usdc_mint {
        PaymentKind::Usdc
    } else if platform.usdt_mint == Some(mint) {
        PaymentKind::Usdt
    } else {
        return Err(FractachainError::PaymentMintNotAllowed.into());
    };
    let offering = &mut ctx.accounts.offering;
    offering.payment_mint = mint;
    offering.payment_kind = kind;
    offering.escrow_ata = ctx.accounts.escrow_ata.key();
    Ok(())
}
