'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { API_BASE_URL, bearerHeaders, getApiBaseUrl } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { formatInt } from '../../../lib/format';
import { isSelfCustody, signAndRelay } from '../../../lib/selfCustody';
import { explorerAddress } from '../../../lib/explorer';

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = params.id as string;
  const { user, token, refreshUser, approveToken, claimTokens, distributeTokens, finalizeOffering, refundContribution } = useAuth();
  const { t } = useI18n();
  const [listing, setListing] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  // String state so the field can be emptied while typing; `amount` is the parsed number.
  const [amountStr, setAmountStr] = useState('100');
  const amount = Number(amountStr) || 0;
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<{ kind: string; hash: string; explorer?: string | null } | null>(null);

  const load = useCallback(() => {
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('fc_auth_token') : null);
    return fetch(`${API_BASE_URL}/api/listings/${poolId}`, {
      headers: bearerHeaders(auth),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setListing(json.data);
          setValidation(json.validation);
          const min = json.data.dossier?.minInvestmentUsdc || json.data.dossier?.pricePerShareUsdc || 100;
          setAmountStr((prev) => prev || String(min));
        }
        return json;
      });
  }, [poolId, token]);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  const invest = async () => {
    setNotice('');
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('fc_auth_token') : null);
    const sol = listing?.dossier?.paymentKind === 'SOL';
    const onChainLive = Boolean(listing?.onChain?.live);
    if (!auth) {
      setNotice(t(sol ? 'market.loginToContributeSol' : 'market.loginToContribute'));
      return;
    }
    setBusy(true);
    try {
      let data: any;
      if (onChainLive && isSelfCustody(user)) {
        // Wallet propia: el contrato pide la firma del inversor, así que el
        // backend arma la transacción y la wallet la firma.
        setNotice(t('market.walletSign'));
        data = await signAndRelay({
          prepare: `/api/listings/${poolId}/contribute/prepare`,
          submit: `/api/listings/${poolId}/contribute/submit`,
          token: auth,
          body: { usdcAmount: Number(amount) },
        });
      } else {
        const res = await fetch(`${getApiBaseUrl()}/api/listings/${poolId}/contribute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth}`,
          },
          body: JSON.stringify({ usdcAmount: Number(amount) }),
        });
        const raw = await res.text();
        let json: any = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(t('misc.apiDown400'));
        }
        if (!res.ok || json.success === false) {
          throw new Error(json.message || t('market.subscribeFail'));
        }
        data = json.data;
      }
      setListing(data);
      await refreshUser();
      await load();
      const onChain = data?.onChain;
      const contributeHash = onChain?.contributeHash;
      const hash = contributeHash || onChain?.trustlineHash;
      const raised = Number(data.raisedUsdc).toLocaleString('es-AR');
      const unit = data?.dossier?.paymentKind === 'SOL' ? 'SOL' : 'USDC';
      if (contributeHash) {
        setLastHash({ kind: 'contribute', hash: contributeHash, explorer: onChain?.contributeExplorer });
        setNotice(t('market.subscribedContributeHash', { n: raised, u: unit, hash: contributeHash }));
      } else if (hash) {
        setLastHash({ kind: 'trustline', hash, explorer: onChain?.trustlineExplorer });
        setNotice(t('market.subscribedHash', { n: raised, hash }));
      } else if (onChainLive) {
        setNotice(t('market.subscribedRaisedSol', { n: raised, u: unit }));
      } else {
        setNotice(t('market.subscribedRaised', { n: raised }));
      }
    } catch (e: any) {
      const msg = e?.message || t('market.subscribeFail');
      setNotice(/failed to fetch/i.test(msg) ? t('market.apiDown') : msg);
    } finally {
      setBusy(false);
    }
  };

  const runFinalize = async () => {
    setNotice('');
    if (!token) {
      setNotice(t('market.loginToFinalize'));
      return;
    }
    setBusy(true);
    try {
      const data = await finalizeOffering(poolId);
      const hash = data?.onChain?.hash;
      if (hash) setLastHash({ kind: 'finalize', hash, explorer: data?.onChain?.explorer });
      setNotice(hash ? t('market.finalizeNotice', { hash }) : data?.onChain?.note || 'finalize() OK');
      await load();
      await refreshUser();
    } catch (e: any) {
      setNotice(e?.message || t('market.finalizeNeedCap'));
    } finally {
      setBusy(false);
    }
  };

  const runRefund = async () => {
    setNotice('');
    if (!token) {
      setNotice(t('market.loginToRefund'));
      return;
    }
    setBusy(true);
    try {
      const data = await refundContribution(poolId, isSelfCustody(user));
      const hash = data?.onChain?.hash;
      const rUnit = listing?.dossier?.paymentKind === 'SOL' ? 'SOL' : 'USDC';
      if (hash) setLastHash({ kind: 'refund', hash, explorer: data?.onChain?.explorer });
      setNotice(hash ? t('market.refundNotice', { hash, u: rUnit }) : data?.onChain?.note || 'refund() OK');
      await load();
      await refreshUser();
    } catch (e: any) {
      setNotice(e?.message || t('err.refundFail'));
    } finally {
      setBusy(false);
    }
  };

  if (listing && validation) {
    const d = listing.dossier;
    const sol = d.paymentKind === 'SOL';
    const unit = sol ? 'SOL' : 'USDC';
    const live = listing.onChain || {};
    const stateName = live.stateName || live.state;
    const canFinalize = Boolean(live.canFinalize);
    const failed = listing.status === 'CLOSED_FAILED' || stateName === 'Failed';
    const success = listing.status === 'CLOSED_SUCCESS' || stateName === 'Successful' || stateName === 'Terminated';
    const holding = user?.holdings?.find((h) => h.listingId === listing.id);
    const canClaim =
      success &&
      Boolean(user?.trustlines?.includes(listing.id)) &&
      (holding?.tokensOwed || 0) > 0 &&
      !holding?.refundedAt;
    const canRefund =
      Boolean(live.live) && failed && Boolean(holding) && !holding?.refundedAt;
    // Units already paid on-chain to the user's wallet (what the wallet shows)
    // vs. units that exist only in the platform ledger and can still be sent.
    const onChainUnits = Number(holding?.tokensOnChain || 0);
    const pendingOnChain = Math.max(0, Number(holding?.tokens || 0) - onChainUnits);
    const statusLabel = failed
      ? t('market.stateFailed')
      : success
        ? t('market.stateSuccess')
        : canFinalize
          ? t('market.stateReady')
          : t('market.stateOpen');

    return (
      <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 mb-4">
        {t('market.honestyBanner')}
      </div>
        <Link href="/mercado" className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <ArrowLeft className="w-4 h-4" /> {t('market.back')}
        </Link>
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-5">
            <div className="p-6 rounded-3xl crystal-card space-y-3">
              <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">{d.tokenTicker} · {d.ticker}</p>
              <h1 className="text-3xl font-extrabold font-display">{d.legalName}</h1>
              <p className="text-neutral-600">{d.useOfProceeds}</p>
              {live.live && (
                <p className="text-xs text-neutral-500">{t('market.finalizeRule')}</p>
              )}
            </div>
            <div className="p-6 rounded-3xl crystal-card space-y-3">
              <h2 className="font-section text-xl font-extrabold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> {t('market.dossier')}
              </h2>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-neutral-500">CUIT</dt><dd className="font-bold">{d.cuit}</dd></div>
                <div><dt className="text-neutral-500">ISIN</dt><dd className="font-mono">{d.isin}</dd></div>
                <div><dt className="text-neutral-500">CNV</dt><dd>{d.cnvRecordId}</dd></div>
                <div><dt className="text-neutral-500">BYMA</dt><dd>{d.bymaRequestId || '—'}</dd></div>
                <div><dt className="text-neutral-500">Caja de Valores</dt><dd className="font-mono text-xs">{d.cajaSubaccount}</dd></div>
                <div><dt className="text-neutral-500">{t('market.custodian')}</dt><dd>{d.custodianCuit}</dd></div>
                <div><dt className="text-neutral-500">{t('admIss.f.auditor')}</dt><dd>{d.auditor}</dd></div>
                <div><dt className="text-neutral-500">{t('market.backing')}</dt><dd>{validation.token.backing}</dd></div>
              </dl>
              <details className="pt-2">
                <summary className="text-xs text-neutral-500 cursor-pointer select-none">
                  {t('market.techDetails')}
                </summary>
                <dl className="grid sm:grid-cols-2 gap-3 text-sm pt-3">
                  <div className="sm:col-span-2"><dt className="text-neutral-500">{t('market.estatuto')}</dt><dd className="font-mono text-xs break-all">{d.estatutoHash}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-neutral-500">Offering PDA</dt><dd className="font-mono text-xs break-all">{listing.stockContract}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-neutral-500">{t('market.licitacion')}</dt>
                    <dd className="font-mono text-xs break-all">
                      {listing.licitacionContract ? (
                        <a
                          href={explorerAddress(listing.licitacionContract)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {listing.licitacionContract}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2"><dt className="text-neutral-500">{t('market.cvDeposit')}</dt><dd className="font-mono text-xs break-all">{listing.cvDepositHash}</dd></div>
                </dl>
                <ul className="text-sm space-y-1 pt-2">
                  {validation.checks.map((c: any) => (
                    <li key={c.key} className={c.ok ? 'text-[#2f6f28]' : 'text-red-700'}>
                      {c.ok ? '✓' : '×'} {c.label}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="p-6 rounded-3xl crystal-card space-y-4 sticky top-24">
              <h3 className="font-display font-extrabold">{t('market.subscribe')}</h3>
              <p className="text-sm font-bold">{statusLabel}</p>
              <p className="text-sm text-neutral-600">
                {formatInt(live.raised ?? listing.raisedUsdc)} / {formatInt(d.offeringHardCapUsdc)} {unit} · {t('market.min')} {formatInt(d.minInvestmentUsdc || d.pricePerShareUsdc)} {unit}
              </p>
              {typeof live.investorRwa === 'number' && (
                <p className="text-xs text-neutral-500 font-mono">RWA on-chain: {live.investorRwa}</p>
              )}
              <input
                type="number"
                min={d.minInvestmentUsdc || d.pricePerShareUsdc}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full px-3 py-3 rounded-xl border border-black/10 font-mono"
              />
              {listing.status === 'CLOSED_SUCCESS' && (
                <p className="text-sm text-[#2f6f28] font-bold">{live.live ? t('market.closedSuccess', { u: unit }) : t('market.closed')}</p>
              )}
              {listing.status === 'CLOSED_FAILED' && (
                <p className="text-sm text-red-800 font-bold">{t('market.closedFailed')}</p>
              )}
              {listing.status === 'LISTED' && (
                <p className="text-sm text-neutral-600">
                  {live.live
                    ? t('market.closesAtSol', { n: formatInt(d.offeringHardCapUsdc), u: unit })
                    : t('market.closesAt', { n: formatInt(d.offeringSoftCapUsdc) })}
                </p>
              )}
              {live.live && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">{t('market.payoutHint', { u: unit })}</p>
                  <p className="text-xs text-neutral-500">{t('market.autoSettle')}</p>
                  {live.fiduciary && (
                    <p className="text-[11px] font-mono break-all text-neutral-500">
                      {t('market.payoutTo')} {live.fiduciary}
                    </p>
                  )}
                  {typeof live.fiduciaryUsdc === 'number' && (
                    <p className="text-[11px] text-neutral-500">
                      {t('market.payoutBalance', { n: live.fiduciaryUsdc.toFixed(4), u: 'USDC' })}
                    </p>
                  )}
                  {typeof live.fiduciaryUsdc !== 'number' && typeof live.fiduciarySol === 'number' && (
                    <p className="text-[11px] text-neutral-500">
                      {t('market.payoutBalance', { n: live.fiduciarySol.toFixed(4), u: 'SOL' })}
                    </p>
                  )}
                  {live.fiduciaryMismatch && (
                    <p className="text-[11px] text-red-800 font-bold">{t('market.payoutMismatch')}</p>
                  )}
                </div>
              )}
              {user?.kycStatus === 'APPROVED' && !user?.trustlines?.includes(listing.id) && (
                <button
                  type="button"
                  onClick={() => approveToken(listing.id).then(() => setNotice(t('market.approvedNotice'))).catch((e) => setNotice(e.message))}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                >
                  {t('market.approve')}
                </button>
              )}
              {canClaim && (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-500">{t('market.claimHint')}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      claimTokens(listing.id)
                        .then((data: any) => {
                          const dist = data?.distribution;
                          if (dist?.hash) {
                            setLastHash({ kind: 'distribute', hash: dist.hash, explorer: `https://explorer.solana.com/tx/${dist.hash}?cluster=devnet` });
                            setNotice(t('market.claimedOnChain', { hash: dist.hash }));
                          } else if (dist?.error) {
                            setNotice(`${t('market.claimedNotice')} ${dist.error}`);
                          } else {
                            setNotice(t('market.claimedNotice'));
                          }
                        })
                        .catch((e) => setNotice(e.message))
                    }
                    className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                  >
                    {t('market.claim')}
                  </button>
                </div>
              )}
              {user && holding && (Number(holding.tokens) > 0 || onChainUnits > 0) && (
                <div className="space-y-2 border-t border-black/10 pt-3">
                  <p className="text-xs text-neutral-600">
                    {t('market.walletUnits', { n: onChainUnits.toFixed(4), code: d.tokenTicker })}
                  </p>
                  {d.issuerPublicKey ? (
                    <p className="text-[11px] font-mono break-all text-neutral-500">
                      {d.tokenTicker}:{d.issuerPublicKey}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-500">{t('market.noIssuerYet')}</p>
                  )}
                  <p className="text-[11px] text-neutral-500">
                    {user.custodyMode === 'SELF'
                      ? t('market.walletHintSelf')
                      : t('market.walletHintCustodial')}
                  </p>
                  {pendingOnChain > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setNotice('');
                        distributeTokens(listing.id)
                          .then((data: any) => {
                            if (data?.hash) {
                              setLastHash({ kind: 'distribute', hash: data.hash, explorer: `https://explorer.solana.com/tx/${data.hash}?cluster=devnet` });
                              setNotice(t('market.receivedOnChain', { n: Number(data.amount).toFixed(4), code: d.tokenTicker }));
                            } else {
                              setNotice(t('market.claimedNotice'));
                            }
                          })
                          .catch((e) => setNotice(e?.message || t('err.distributeFail')))
                          .finally(() => setBusy(false));
                      }}
                      className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-40"
                    >
                      {t('market.receiveInWallet')}
                    </button>
                  )}
                </div>
              )}
              {canRefund && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={runRefund}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                >
                  {busy ? t('market.refundBusy') : t('market.refund', { u: unit })}
                </button>
              )}
              {holding?.refundedAt && (
                <p className="text-sm text-[#2f6f28] font-bold">{t('dash.refunded')}</p>
              )}
              {success && listing.manifestMarket && (
                <Link
                  href={`/orderbook?listing=${listing.id}`}
                  className="block w-full py-3 rounded-2xl bg-black text-white text-center font-display font-bold"
                >
                  {t('nav.orderbook')}
                </Link>
              )}
              {user?.kycStatus !== 'APPROVED' && (
                <p className="text-sm text-neutral-600">
                  {t('market.kycOnly')}{' '}
                  <Link href="/login" className="underline font-bold">{t('nav.login')}</Link>
                </p>
              )}
              <button
                type="button"
                onClick={invest}
                disabled={busy || user?.kycStatus !== 'APPROVED' || listing.status !== 'LISTED'}
                className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-40"
              >
                {busy ? '…' : sol ? t('market.contributeSol') : t('market.contribute')}
              </button>
              {live.live && listing.status === 'LISTED' && (
                <button
                  type="button"
                  onClick={runFinalize}
                  disabled={busy || !canFinalize}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold disabled:opacity-40"
                >
                  {busy ? t('market.finalizeBusy') : t('market.finalize')}
                </button>
              )}
              {notice && <p className="text-sm">{notice}</p>}
              {listing.onChain?.explorer && (
                <a
                  href={listing.onChain.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.contract')}
                </a>
              )}
              {listing.onChain?.contributeExplorer && (
                <a
                  href={listing.onChain.contributeExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.contributeTx')}
                </a>
              )}
              {listing.onChain?.finalizeExplorer && (
                <a
                  href={listing.onChain.finalizeExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.finalizeTx')}
                </a>
              )}
              {lastHash?.explorer && (
                <a
                  href={lastHash.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {lastHash.kind === 'finalize'
                    ? t('market.finalizeTx')
                    : lastHash.kind === 'refund'
                      ? t('market.refundTx')
                      : lastHash.kind === 'distribute'
                        ? t('market.distributeTx')
                        : lastHash.kind === 'contribute'
                          ? t('market.contributeTx')
                          : t('market.ata')}
                  {': '}
                  {lastHash.hash}
                </a>
              )}
              {listing.onChain?.trustlineExplorer && (
                <a
                  href={listing.onChain.trustlineExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.ata')}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return <p className="py-16 text-center text-neutral-500">{t('market.loading')}</p>;
  }
  return <p className="py-16 text-center text-neutral-500">{t('market.missing')}</p>;
}
