use anchor_lang::prelude::*;
use crate::errors::FractachainError;
use crate::state::{Investor, Offering, Opa, OpaState};

pub const BPS_DENOM: u64 = 10_000;
/// >50% ownership triggers the mandatory tender offer (Art. 87).
pub const OPA_THRESHOLD_BPS: u64 = 5_000;
/// >=95% enables squeeze-out (Art. 88) and disables OPA bookkeeping.
pub const SQUEEZE_OUT_THRESHOLD_BPS: u64 = 9_500;
/// Window the acquirer has to launch the OPA after crossing 50%.
pub const OPA_DEADLINE_SECONDS: i64 = 30 * 86_400;
/// Window minorities have to accept a live OPA offer.
pub const OPA_OFFER_SECONDS: i64 = 30 * 86_400;

pub fn is_gafi_blacklisted(country_code: u32) -> bool {
    country_code == 364 || country_code == 408 || country_code == 104
}

/// Monday–Friday 08:00–16:00 ART (UTC-3). Operational window, not a security
/// boundary — identical math to the Soroban version.
pub fn is_argentina_business_hours(ts: i64) -> bool {
    if ts < 10_800 {
        return false;
    }
    let art_time = (ts - 10_800) as u64;
    let day_of_week = ((art_time / 86_400) + 4) % 7;
    let hour = (art_time % 86_400) / 3_600;
    (1..=5).contains(&day_of_week) && (8..16).contains(&hour)
}

pub fn is_investor_verified(investor: &Investor, now: i64) -> bool {
    investor.is_active && investor.kyc_expiry > now && !is_gafi_blacklisted(investor.country_code)
}

/// Gate for every path that puts tokens **into** an account. Receiving
/// requires live KYC; returning value never does — gating a refund or an
/// exit would confiscate, not enforce.
pub fn require_kyc_to_receive(investor: &Investor, now: i64) -> Result<()> {
    require!(
        is_investor_verified(investor, now),
        FractachainError::RecipientKycNotVerified
    );
    Ok(())
}

pub fn checked_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or(FractachainError::Overflow.into())
}

pub fn checked_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(FractachainError::Overflow.into())
}

/// Feeds the Art. 88 floor: keeps the max unit price ever seen (primary
/// price, market prints, OPA/squeeze quotes).
pub fn record_price(offering: &mut Offering, price: u64) {
    if price > offering.highest_price {
        offering.highest_price = price;
    }
}

/// Minimum acceptable price for an OPA or squeeze-out (Art. 88):
/// max(primary price, highest market price seen, live OPA price).
pub fn equitable_price_floor(primary: u64, highest: u64, opa: Option<&Opa>) -> u64 {
    let mut floor = primary.max(highest);
    if let Some(o) = opa {
        floor = floor.max(o.price_per_share);
    }
    floor
}

pub fn ownership_bps(balance: u64, total: u64) -> u64 {
    if total == 0 {
        return 0;
    }
    balance.saturating_mul(BPS_DENOM) / total
}

/// Detects the 50% control crossing and, once the deadline lapses without an
/// offer, suspends votes. Returns the action the caller should apply to the
/// `Opa`/`Investor` accounts (init-if-needed + writes are done in the ix,
/// not inside a CPI — PDA creation needs a signer anyway).
pub enum ThresholdAction {
    None,
    Trigger { ownership_bps: u64 },
    SuspendVotes { ownership_bps: u64 },
}

pub fn evaluate_control_threshold(
    holder_balance: u64,
    total_supply: u64,
    opa: Option<&Opa>,
    now: i64,
) -> ThresholdAction {
    if total_supply == 0 {
        return ThresholdAction::None;
    }
    let bps = ownership_bps(holder_balance, total_supply);
    if bps >= SQUEEZE_OUT_THRESHOLD_BPS || bps < OPA_THRESHOLD_BPS {
        return ThresholdAction::None;
    }
    match opa {
        None => ThresholdAction::Trigger { ownership_bps: bps },
        Some(o) => {
            if o.state == OpaState::Triggered && now > o.deadline {
                ThresholdAction::SuspendVotes { ownership_bps: bps }
            } else {
                ThresholdAction::None
            }
        }
    }
}

/* ------------------------------------------------------------------ tests */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{InvestorType, OfferingState, PaymentKind};

    fn offering(units_sold: u64, highest: u64) -> Offering {
        Offering {
            listing_seed: [1u8; 32],
            admin: Pubkey::default(),
            fiduciary: Pubkey::default(),
            payment_mint: Pubkey::default(),
            payment_kind: PaymentKind::Usdc,
            rwa_mint: Pubkey::default(),
            treasury_ata: Pubkey::default(),
            escrow_ata: Pubkey::default(),
            soft_cap: 0,
            hard_cap: 0,
            deadline: 0,
            price_per_unit: 0,
            total_raised: 0,
            units_minted: 0,
            units_sold,
            cv_deposit_hash: [0u8; 32],
            state: OfferingState::Open,
            legal_info: crate::state::LegalInfo {
                fideicomiso_hash: [0u8; 32],
                cnv_record_id: String::new(),
                legal_terms_uri: String::new(),
            },
            proceeds_withdrawn: false,
            highest_price: highest,
            squeeze_price: 0,
            product_id: 1,
            bump: 0,
            mint_bump: 0,
        }
    }

    #[test]
    fn gafi_blocklist() {
        assert!(is_gafi_blacklisted(364));
        assert!(is_gafi_blacklisted(408));
        assert!(is_gafi_blacklisted(104));
        assert!(!is_gafi_blacklisted(32)); // AR
        assert!(!is_gafi_blacklisted(840)); // US
    }

    #[test]
    fn art_business_hours() {
        // 2024-01-01 was a Monday (epoch 1704067200).
        // Mon 12:00 UTC = 09:00 ART → inside.
        assert!(is_argentina_business_hours(1_704_110_400));
        // Mon 20:00 UTC = 17:00 ART → outside.
        assert!(!is_argentina_business_hours(1_704_139_200));
        // 2024-01-06 Saturday 12:00 UTC → outside.
        assert!(!is_argentina_business_hours(1_704_542_400));
        // Mon 10:00 UTC = 07:00 ART → outside (before 08:00).
        assert!(!is_argentina_business_hours(1_704_103_200));
    }

    #[test]
    fn ownership_math() {
        assert_eq!(ownership_bps(0, 100), 0);
        assert_eq!(ownership_bps(50, 100), 5_000);
        assert_eq!(ownership_bps(95, 100), 9_500);
        assert_eq!(ownership_bps(1, 0), 0);
    }

    #[test]
    fn threshold_triggers_at_50pct() {
        let now = 100i64;
        // 50% exactly → trigger.
        match evaluate_control_threshold(50, 100, None, now) {
            ThresholdAction::Trigger { ownership_bps } => assert_eq!(ownership_bps, 5_000),
            _ => panic!("expected trigger"),
        }
        // 49.9% → nothing.
        assert!(matches!(
            evaluate_control_threshold(49, 100, None, now),
            ThresholdAction::None
        ));
        // 95%+ → squeeze territory, no OPA bookkeeping.
        assert!(matches!(
            evaluate_control_threshold(95, 100, None, now),
            ThresholdAction::None
        ));
        // Empty float → nothing.
        assert!(matches!(
            evaluate_control_threshold(50, 0, None, now),
            ThresholdAction::None
        ));
    }

    #[test]
    fn trigger_does_not_repeat() {
        let now = 100i64;
        let opa = Opa {
            offering: Pubkey::default(),
            state: OpaState::Triggered,
            acquirer: Pubkey::default(),
            price_per_share: 0,
            escrow_amount: 0,
            accepted_total: 0,
            triggered_at: now,
            deadline: now + 1_000,
            bump: 0,
        };
        // Record exists, deadline not lapsed → no re-trigger.
        assert!(matches!(
            evaluate_control_threshold(60, 100, Some(&opa), now),
            ThresholdAction::None
        ));
        // Deadline lapsed, still >50% → suspend votes (Art. 88).
        match evaluate_control_threshold(60, 100, Some(&opa), now + 2_000) {
            ThresholdAction::SuspendVotes { ownership_bps } => assert_eq!(ownership_bps, 6_000),
            _ => panic!("expected vote suspension"),
        }
    }

    #[test]
    fn record_price_keeps_max() {
        let mut o = offering(0, 100);
        record_price(&mut o, 50);
        assert_eq!(o.highest_price, 100);
        record_price(&mut o, 150);
        assert_eq!(o.highest_price, 150);
    }

    #[test]
    fn equitable_floor_picks_max() {
        assert_eq!(equitable_price_floor(10, 20, None), 20);
        let opa = Opa {
            offering: Pubkey::default(),
            state: OpaState::ActiveOffer,
            acquirer: Pubkey::default(),
            price_per_share: 30,
            escrow_amount: 0,
            accepted_total: 0,
            triggered_at: 0,
            deadline: 0,
            bump: 0,
        };
        assert_eq!(equitable_price_floor(10, 20, Some(&opa)), 30);
    }

    #[test]
    fn investor_verification_rules() {
        let now = 1_000i64;
        let inv = Investor {
            wallet: Pubkey::default(),
            country_code: 32,
            investor_type: InvestorType::National,
            kyc_expiry: 2_000,
            is_active: true,
            voting_rights: true,
            registered_at: 0,
            bump: 0,
        };
        assert!(is_investor_verified(&inv, now));
        // Expired.
        assert!(!is_investor_verified(&inv, 2_500));
        // Revoked.
        let mut revoked = inv.clone();
        revoked.is_active = false;
        assert!(!is_investor_verified(&revoked, now));
        // GAFI.
        let mut gafi = inv;
        gafi.country_code = 408;
        assert!(!is_investor_verified(&gafi, now));
    }
}
