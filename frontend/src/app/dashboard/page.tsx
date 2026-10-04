'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, TrendingUp, ArrowRight, KeyRound, Copy, Check, DollarSign } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import WalletAddress from '../../components/WalletAddress';
import { API_BASE_URL } from '../../lib/api';
import { formatAmount } from '../../lib/format';

type Position = {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  shares: number;
  tokens: number;
  tokensOwed: number;
  tokensOnChain?: number;
  sdex?: boolean;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  priceSourceLabel: string;
  pendingDividendUsdc: number;
  listingStatus?: string;
  paymentKind?: string | null;
  finalizeHash?: string | null;
  refundedAt?: string | null;
  refundHash?: string | null;
  canClaim?: boolean;
  canRefund?: boolean;
};

type Proceed = {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  status: string;
  paymentKind?: string | null;
  amount: number;
  paidAt?: string | null;
  finalizeHash?: string | null;
  explorer?: string | null;
};

type Portfolio = {
  cashUsdc: number;
  usdcOnChain?: number;
  xlmOnChain?: number;
  proceeds?: Proceed[];
  positions: Position[];
  totals: {
    costBasis: number;
    marketValue: number;
    pnl: number;
    pnlPct: number;
    pendingDividends: number;
  };
};

function money(n: number, digits = 2) {
  return formatAmount(n, digits);
}

export default function DashboardPage() {
  const { user, token, approveToken, claimTokens, distributeTokens, claimDividends, refundContribution, fetchWalletSecret } = useAuth();
  const { t } = useI18n();
  const [book, setBook] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretErr, setSecretErr] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [fundingUsdc, setFundingUsdc] = useState(false);
  const [usdcNotice, setUsdcNotice] = useState('');

  const revealSecret = async () => {
    try {
      setSecretErr('');
      setSecret(await fetchWalletSecret());
    } catch (e: any) {
      setSecretErr(e?.message || 'Error');
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  const load = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success && res.data) setBook(res.data);
  };

  useEffect(() => {
    load();
  }, [token, user?.holdings?.length, user?.cashUsdc]);

  const holdings = book?.positions?.length
    ? book.positions
    : (user?.holdings || []).map((h) => ({
        listingId: h.listingId,
        tokenTicker: h.tokenTicker,
        legalName: h.tokenTicker,
        shares: h.tokens + (h.tokensOwed || 0),
        tokens: h.tokens,
        tokensOwed: h.tokensOwed || 0,
        tokensOnChain: h.tokensOnChain || 0,
        sdex: false,
        costBasis: h.usdcAmount,
        marketPrice: 0,
        marketValue: h.usdcAmount,
        pnl: 0,
        pnlPct: 0,
        priceSourceLabel: t('misc.loadingQuote'),
        pendingDividendUsdc: h.pendingDividendUsdc || 0,
        listingStatus: undefined,
        paymentKind: null,
        finalizeHash: null,
        refundedAt: h.refundedAt || null,
        refundHash: h.refundHash || null,
        canClaim: (h.tokensOwed || 0) > 0 && !h.refundedAt,
        canRefund: false,
      }));

  const totals = book?.totals || {
    costBasis: holdings.reduce((s, h) => s + h.costBasis, 0),
    marketValue: holdings.reduce((s, h) => s + h.marketValue, 0),
    pnl: 0,
    pnlPct: 0,
    pendingDividends: holdings.reduce((s, h) => s + (h.pendingDividendUsdc || 0), 0),
  };

  // Wallets created before the faucet exist on-chain but have no USDC — the
  // button tops them up to the grant. Custodial is silent; self-custody signs
  // one signature in the wallet (the only signature the chain accepts).
  const fundUsdc = async () => {
    if (!token) return;
    setFundingUsdc(true);
    setUsdcNotice('');
    try {
      const { ensureUsdcReady } = await import('../../lib/usdc');
      const data = await ensureUsdcReady(token);
      setUsdcNotice(
        data?.already
          ? t('wallet.usdcAlready', { n: Number(data.balance).toLocaleString() })
          : t('wallet.usdcFunded', { n: Number(data?.balance ?? 0).toLocaleString() }),
      );
      await load();
    } catch (e: any) {
      setUsdcNotice(e?.message || t('wallet.usdcFundFail'));
    } finally {
      setFundingUsdc(false);
    }
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{t('nav.portfolio')}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-black break-words">{t('dash.hello', { name: user?.legalName || user?.name || '' })}</h1>
          <p className="text-neutral-600 mt-1">
            {user?.custodyMode === 'SELF' ? t('dash.verifiedSelf') : t('dash.verifiedCustodial')}
          </p>
        </div>
        <div className="p-4 rounded-2xl crystal-card max-w-lg">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-display font-bold mb-1">{t('nav.yourWallet')}</p>
          <WalletAddress address={user?.publicKey} />
          {user?.custodyMode === 'CUSTODIAL' && !secret && (
            <button
              type="button"
              onClick={revealSecret}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-600 hover:text-black"
            >
              <KeyRound className="w-3.5 h-3.5" /> {t('dash.revealSecret')}
            </button>
          )}
          {secret && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] text-amber-700">{t('dash.secretWarn')}</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 p-2 rounded-lg bg-neutral-100 text-[10px] font-mono break-all select-all">{secret}</code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-neutral-600 hover:text-black shrink-0"
                >
                  {secretCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {secretCopied ? t('wallet.copied') : t('wallet.copy')}
                </button>
              </div>
            </div>
          )}
          {secretErr && <p className="mt-1 text-[11px] text-red-700">{secretErr}</p>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">{t('dash.cash')}</div>
          <div className="text-2xl font-lcd font-bold">${money(book?.usdcOnChain ?? 0)}</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            {t('dash.cashDemo')}: ${money(Number(user?.cashUsdc || book?.cashUsdc || 0))}
          </div>
          {(book?.usdcOnChain ?? 0) <= 0 && user?.publicKey && user?.custodyMode === 'SELF' && (
            <button
              type="button"
              onClick={fundUsdc}
              disabled={fundingUsdc}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black text-white text-[11px] font-display font-bold uppercase tracking-wide disabled:opacity-50"
            >
              <DollarSign className="w-3.5 h-3.5" />
              {fundingUsdc ? t('wallet.usdcFunding') : t('dash.fundUsdc')}
            </button>
          )}
          {usdcNotice && <p className="mt-2 text-[11px] text-neutral-600">{usdcNotice}</p>}
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">{t('dash.marked')}</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.marketValue)}</div>
          <div className={`text-xs mt-1 ${totals.pnl >= 0 ? 'text-[#2f6f28]' : 'text-red-700'}`}>
            {totals.pnl >= 0 ? '+' : ''}{money(totals.pnl)} USDC ({totals.pnlPct >= 0 ? '+' : ''}{totals.pnlPct}%)
          </div>
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">{t('dash.cost')}</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.costBasis)}</div>
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">{t('dash.dividends')}</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.pendingDividends)}</div>
          <div className="text-xs text-neutral-500 mt-1">{t('dash.positionsCount', { n: holdings.length })}</div>
        </div>
      </div>

      {(book?.proceeds?.length ?? 0) > 0 && (
        <div className="p-5 rounded-3xl crystal-card space-y-3">
          <div>
            <p className="font-display font-extrabold">{t('dash.proceeds')}</p>
            <p className="text-sm text-neutral-600 mt-0.5">{t('dash.proceedsLead')}</p>
            <p className="text-xs text-neutral-500 mt-1">
              {t('dash.solOnChain', { n: money(book?.xlmOnChain ?? 0, 4) })}
            </p>
          </div>
          <div className="space-y-2">
            {book?.proceeds?.map((p) => (
              <div key={p.listingId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <div>
                  <span className="font-bold">{p.tokenTicker}</span>{' '}
                  <span className="text-neutral-600">{p.legalName}</span>
                  {p.explorer && (
                    <a
                      href={p.explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-[11px] font-mono underline break-all"
                    >
                      {t('dash.proceedsTx')}
                    </a>
                  )}
                  {!p.finalizeHash && p.status === 'LISTED' && (
                    <span className="block text-[11px] text-neutral-500">{t('dash.proceedsPending')}</span>
                  )}
                </div>
                <div className="font-lcd font-bold">
                  {money(p.amount, p.paymentKind === 'XLM' ? 4 : 2)} {p.paymentKind === 'XLM' ? 'SOL' : 'USDC'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 rounded-3xl crystal-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-display font-extrabold">{t('dash.marketCta')}</p>
          <p className="text-sm text-neutral-600 mt-0.5">{t('dash.marketCtaLead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orderbook" className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold text-sm inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> {t('nav.orderbook')} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/market" className="px-5 py-3 rounded-2xl border border-black/10 font-display font-bold text-sm inline-flex items-center gap-2">
            <Layers className="w-4 h-4" /> {t('nav.market')}
          </Link>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="p-8 rounded-3xl crystal-card text-center space-y-3">
          <p className="text-neutral-600">{t('dash.empty')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/market" className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold text-sm inline-flex items-center gap-2">
              <Layers className="w-4 h-4" /> {t('nav.market')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-section text-xl font-extrabold">{t('dash.valued')}</h2>
          {holdings.map((h) => {
            const approved = user?.trustlines?.includes(h.listingId);
            const up = h.pnl >= 0;
            return (
              <div key={h.listingId} className="p-5 rounded-3xl crystal-card space-y-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-display font-extrabold">{h.tokenTicker}</div>
                    <p className="text-sm text-neutral-600">{h.legalName}</p>
                    <p className="text-sm text-neutral-600 mt-1">
                      {h.shares.toFixed(4)} acciones · en wallet {h.tokens.toFixed(4)}
                      {h.tokensOwed > 0 ? ` · pendientes ${h.tokensOwed.toFixed(4)}` : ''}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Precio actual ${money(h.marketPrice)} · {h.priceSourceLabel}
                    </p>
                    {h.listingStatus === 'CLOSED_SUCCESS' && (
                      <p className="text-xs text-[#2f6f28] font-bold mt-1">{t('dash.closedSuccess')}</p>
                    )}
                    {h.listingStatus === 'CLOSED_FAILED' && (
                      <p className="text-xs text-red-800 font-bold mt-1">{t('dash.closedFailed')}</p>
                    )}
                    {h.listingStatus === 'LISTED' && (
                      <p className="text-xs text-neutral-500 mt-1">{t('dash.listed')}</p>
                    )}
                    {h.refundedAt && (
                      <p className="text-xs text-[#2f6f28] font-bold mt-1">{t('dash.refunded')}</p>
                    )}
                    {h.finalizeHash && (
                      <a
                        href={`https://explorer.solana.com/tx/${h.finalizeHash}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] font-mono underline break-all mt-1"
                      >
                        {t('market.finalizeTx')}
                      </a>
                    )}
                    {h.refundHash && (
                      <a
                        href={`https://explorer.solana.com/tx/${h.refundHash}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] font-mono underline break-all mt-1"
                      >
                        {t('market.refundTx')}
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-lcd font-bold">${money(h.marketValue)}</div>
                    <div className={`text-xs font-bold ${up ? 'text-[#2f6f28]' : 'text-red-700'}`}>
                      {up ? '+' : ''}{money(h.pnl)} ({up ? '+' : ''}{h.pnlPct}%)
                    </div>
                    <div className="text-[11px] text-neutral-500">costo ${money(h.costBasis)}</div>
                  </div>
                </div>
                {h.pendingDividendUsdc > 0 && (
                  <p className="text-sm text-[#2f6f28] font-bold">
                    Dividendo pendiente: ${money(h.pendingDividendUsdc)} USDC
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!approved && (
                    <button
                      type="button"
                      disabled={busy === h.listingId}
                      onClick={() => run(h.listingId, () => approveToken(h.listingId))}
                      className="px-4 py-2 rounded-xl bg-black text-white text-xs font-display font-bold"
                    >
                      {t('dash.approve')}
                    </button>
                  )}
                  {approved && (h.canClaim ?? h.tokensOwed > 0) && h.listingStatus !== 'CLOSED_FAILED' && !h.refundedAt && (
                    <button
                      type="button"
                      disabled={busy === h.listingId}
                      onClick={() => run(h.listingId, () => claimTokens(h.listingId))}
                      className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold"
                    >
                      {t('dash.claim')}
                    </button>
                  )}
                  {approved && h.sdex && h.tokens > 0 && (h.tokensOnChain || 0) + 1e-9 < h.tokens && (
                    <button
                      type="button"
                      disabled={busy === `dist-${h.listingId}`}
                      onClick={() => run(`dist-${h.listingId}`, async () => { await distributeTokens(h.listingId); })}
                      className="px-4 py-2 rounded-xl bg-black text-white text-xs font-display font-bold"
                    >
                      {t('dash.receiveOnChain')}
                    </button>
                  )}
                  {h.canRefund && (
                    <button
                      type="button"
                      disabled={busy === `refund-${h.listingId}`}
                      onClick={() => run(`refund-${h.listingId}`, async () => { await refundContribution(h.listingId); })}
                      className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold"
                    >
                      {t('dash.refund')}
                    </button>
                  )}
                  {h.pendingDividendUsdc > 0 && (
                    <button
                      type="button"
                      disabled={busy === `div-${h.listingId}`}
                      onClick={() => run(`div-${h.listingId}`, () => claimDividends(h.listingId))}
                      className="px-4 py-2 rounded-xl bg-black text-white text-xs font-display font-bold"
                    >
                      {t('dash.collect')}
                    </button>
                  )}
                  <Link href={`/market/${h.listingId}`} className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold inline-flex items-center gap-1">
                    {t('market.viewDossier')}
                  </Link>
                  <Link href={`/orderbook?listing=${h.listingId}`} className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold inline-flex items-center gap-1">
                    {t('dash.trade')} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
