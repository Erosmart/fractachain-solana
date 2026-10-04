'use client';

import { useI18n } from '../../context/I18nContext';
import { useDemoState, fmt, fmtInt, shortPk } from './lib';

export default function PortfolioPanel() {
  const s = useDemoState();
  const { t } = useI18n();
  const w = s.wallet;

  const holdings = Object.entries(w.holdings).filter(([, h]) => h.free + h.locked > 0);
  const priced = holdings.map(([tk, h]) => {
    const l = s.listings.find((x) => x.dossier.tokenTicker === tk);
    const px = l?.lastPrice || l?.dossier.pricePerShareUsdc || 0;
    return { tk, h, px, value: h.free * px, l };
  });
  const totalRwa = priced.reduce((a, p) => a + p.value, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          [t('demo.port.sol'), fmt(w.sol, 3)],
          [t('demo.port.usdcFree'), fmt(w.usdc)],
          [t('demo.port.usdcLocked'), fmt(w.usdcLocked)],
          [t('demo.port.rwa'), fmt(totalRwa)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-brand-border bg-brand-card p-4 text-center">
            <div className="font-lcd text-lg font-bold">{v}</div>
            <div className="text-[10px] uppercase tracking-wide text-black/45">{k}</div>
          </div>
        ))}
      </div>

      {!w.connected ? (
        <div className="rounded-2xl border border-brand-border bg-brand-card p-6 text-sm text-black/50">
          {t('demo.port.connectPrompt')}
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-border bg-brand-card shadow-sm overflow-hidden">
          <div className="border-b border-brand-border px-4 py-3 flex justify-between items-center">
            <span className="font-bold text-sm">{t('demo.port.holdings')}</span>
            <span className="font-lcd text-xs text-black/40">{shortPk(w.pubkey)}</span>
          </div>
          {priced.length === 0 ? (
            <div className="p-6 text-sm text-black/40">
              {t('demo.port.noPositions')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-2">{t('demo.port.token')}</th>
                  <th>{t('demo.port.issuer')}</th>
                  <th className="text-right">{t('demo.port.freeCol')}</th>
                  <th className="text-right">{t('demo.port.ordersCol')}</th>
                  <th className="text-right">{t('demo.port.lastPx')}</th>
                  <th className="text-right">{t('demo.port.valueCol')}</th>
                  <th className="text-right pr-4">{t('demo.port.ata')}</th>
                </tr>
              </thead>
              <tbody>
                {priced.map(({ tk, h, px, value, l }) => (
                  <tr key={tk} className="border-t border-black/[.05]">
                    <td className="px-4 py-2.5 font-bold">{tk}</td>
                    <td className="text-black/50 text-xs">{l?.dossier.legalName || '—'}</td>
                    <td className="text-right font-lcd">{fmtInt(h.free)}</td>
                    <td className="text-right font-lcd text-amber-700">{fmtInt(h.locked)}</td>
                    <td className="text-right font-lcd">{fmt(px)}</td>
                    <td className="text-right font-lcd font-bold">{fmt(value)}</td>
                    <td className="text-right pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        w.kycVerified ? 'bg-leaf-100 text-brand-accent' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {w.kycVerified ? 'thawed' : 'frozen'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-xs text-purple-800">
        {t('demo.port.explainer')}
      </div>
    </div>
  );
}
