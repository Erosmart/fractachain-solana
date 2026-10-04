'use client';

import { useState } from 'react';
import { ExternalLink, Wand2 } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import {
  DemoListing, Dossier, EMPTY_DOSSIER, createListing, deployOffering,
  mintTokens, openOffering, finalizeOffering, explorerAddr, shortPk,
  fmtInt, fmt, rand58, useDemoState,
} from './lib';

const STATUS_COLOR: Record<DemoListing['status'], string> = {
  DRAFT: 'bg-black/[.06] text-black/60',
  DEPLOYED: 'bg-blue-100 text-blue-800',
  TOKENS_MINTED: 'bg-purple-100 text-purple-800',
  LISTED: 'bg-leaf-100 text-brand-accent',
  CLOSED_SUCCESS: 'bg-emerald-100 text-emerald-800',
  CLOSED_FAILED: 'bg-red-100 text-red-700',
};

const EXAMPLE: Dossier = {
  legalName: 'Banco Koki S.A.', tradeName: 'Koki', cuit: '30-50001008-4',
  jurisdiction: 'Argentina', sector: 'Financiero', ticker: 'LOKI',
  tokenTicker: 'tLOKI', isin: 'ARLOKI215016', authorizedShares: 639000000,
  sharesToTokenize: 300000, pricePerShareUsdc: 7.4, cajaSubaccount: 'CV-90177-LOKI',
  custodianCuit: '30-68200812-9', cnvRecordId: 'CNV-2025-1210',
  bymaRequestId: 'BYMA-REQ-3422', legalTermsUri: 'https://fractachain.example/legal/tloki',
  estatutoHash: 'a4f1…c9', auditor: 'KPMG Argentina',
  issuerWallet: '', proceedsWallet: '', paymentKind: 'USDC',
  offeringSoftCapUsdc: 100000, offeringHardCapUsdc: 300000, offeringDays: 30,
  tnaUsd: 4.2,
  useOfProceeds: 'Fondeo de la cartera PyME digital y expansión regional.',
  minInvestmentUsdc: 15000,
};

type Field = { key: keyof Dossier; kind?: 'num' | 'wallet'; span?: boolean; placeholder?: string };

const GROUPS: { titleKey: string; fields: Field[] }[] = [
  {
    titleKey: 'demo.groups.company',
    fields: [
      { key: 'legalName', span: true },
      { key: 'tradeName' },
      { key: 'cuit', placeholder: '30-XXXXXXXX-X' },
      { key: 'jurisdiction' },
      { key: 'sector' },
      { key: 'ticker' },
      { key: 'tokenTicker' },
      { key: 'isin' },
      { key: 'auditor', span: true },
    ],
  },
  {
    titleKey: 'demo.groups.tokenization',
    fields: [
      { key: 'authorizedShares', kind: 'num' },
      { key: 'sharesToTokenize', kind: 'num' },
      { key: 'cajaSubaccount' },
      { key: 'custodianCuit' },
      { key: 'issuerWallet', kind: 'wallet', span: true },
    ],
  },
  {
    titleKey: 'demo.groups.legal',
    fields: [
      { key: 'cnvRecordId' },
      { key: 'bymaRequestId' },
      { key: 'legalTermsUri' },
      { key: 'estatutoHash' },
      { key: 'useOfProceeds', span: true },
    ],
  },
  {
    titleKey: 'demo.groups.offering',
    fields: [
      { key: 'pricePerShareUsdc', kind: 'num' },
      { key: 'offeringSoftCapUsdc', kind: 'num' },
      { key: 'offeringHardCapUsdc', kind: 'num' },
      { key: 'offeringDays', kind: 'num' },
      { key: 'tnaUsd', kind: 'num' },
      { key: 'minInvestmentUsdc', kind: 'num' },
      { key: 'proceedsWallet', kind: 'wallet', span: true },
    ],
  },
];

function LifecycleActions({ listing }: { listing: DemoListing }) {
  const { t } = useI18n();
  const l = listing;
  const btn = (label: string, fn: () => void) => (
    <button
      onClick={fn}
      className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white hover:bg-black/80 transition"
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {l.status === 'DRAFT' && btn(t('demo.emision.stepDeploy'), () => deployOffering(l.id))}
      {l.status === 'DEPLOYED' && btn(t('demo.emision.stepMint'), () => mintTokens(l.id))}
      {l.status === 'TOKENS_MINTED' && btn(t('demo.emision.stepOpen'), () => openOffering(l.id))}
      {l.status === 'LISTED' && btn(t('demo.emision.stepFinalize'), () => finalizeOffering(l.id))}
    </div>
  );
}

export default function EmisionPanel() {
  const s = useDemoState();
  const { t } = useI18n();
  const [d, setD] = useState<Dossier>(EMPTY_DOSSIER);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState('');

  const set = (k: keyof Dossier, v: string | number) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const submit = () => {
    setErrors([]);
    setCreated('');
    const r = createListing(d);
    if (r.ok) {
      setCreated(t('demo.emision.created', { id: r.id }));
      setD(EMPTY_DOSSIER);
    } else {
      setErrors(r.errors);
    }
  };

  const errLabel = (e: string) =>
    e.startsWith('demo.') ? t(e) : t(`demo.fields.${e}`);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      {/* Dossier form */}
      <div className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('demo.emision.title')}</h2>
          <button
            onClick={() =>
              setD({ ...EXAMPLE, issuerWallet: rand58(44), proceedsWallet: rand58(44) })
            }
            className="flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1.5 text-xs font-bold text-black/60 hover:text-black hover:border-black/30 transition"
          >
            <Wand2 size={13} /> {t('demo.emision.example')}
          </button>
        </div>
        <p className="mt-1 text-xs text-black/50">{t('demo.emision.subtitle')}</p>

        {GROUPS.map((g) => (
          <div key={g.titleKey} className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-black/45">
              {t(g.titleKey)}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.fields.map((f) => (
                <label key={f.key} className={f.span ? 'sm:col-span-2' : ''}>
                  <span className="block text-xs text-black/60 mb-1">
                    {t(`demo.fields.${f.key}`)}
                  </span>
                  <input
                    value={String(d[f.key] ?? '')}
                    onChange={(e) =>
                      set(f.key, f.kind === 'num' ? Number(e.target.value) : e.target.value)
                    }
                    placeholder={f.placeholder}
                    className={`w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm outline-none focus:border-black/40 ${
                      f.kind === 'wallet' ? 'font-lcd text-xs' : ''
                    }`}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        {errors.length > 0 && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <b>{t('demo.emision.missingTitle')}</b>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((e) => <li key={e}>{errLabel(e)}</li>)}
            </ul>
          </div>
        )}
        {created && (
          <div className="mt-3 rounded-xl border border-leaf-200 bg-leaf-50 p-3 text-xs text-brand-accent font-bold">
            {created}
          </div>
        )}

        <button
          onClick={submit}
          className="mt-4 w-full rounded-full bg-black py-2.5 text-sm font-bold text-white hover:bg-black/85 transition"
        >
          {t('demo.emision.create')}
        </button>
      </div>

      {/* Listings + lifecycle */}
      <div className="space-y-3">
        <h2 className="font-bold text-lg">{t('demo.emision.listings')}</h2>
        {s.listings.map((l) => (
          <div
            key={l.id}
            className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold">
                  {l.dossier.tokenTicker}{' '}
                  <span className="font-normal text-black/50 text-sm">
                    {l.dossier.legalName}
                  </span>
                </div>
                <div className="font-lcd text-[11px] text-black/40">{l.id}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLOR[l.status]}`}>
                {t(`demo.status.${l.status}`)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/[.03] p-2">
                <div className="font-lcd text-sm font-bold">{fmt(l.dossier.pricePerShareUsdc)}</div>
                <div className="text-[10px] text-black/45">{t('demo.emision.perUnit')}</div>
              </div>
              <div className="rounded-xl bg-black/[.03] p-2">
                <div className="font-lcd text-sm font-bold">{fmtInt(l.tokensMinted)}</div>
                <div className="text-[10px] text-black/45">{t('demo.emision.minted')}</div>
              </div>
              <div className="rounded-xl bg-black/[.03] p-2">
                <div className="font-lcd text-sm font-bold">
                  {fmtInt((l.raisedUsdc / Math.max(1, l.dossier.offeringHardCapUsdc)) * 100)}%
                </div>
                <div className="text-[10px] text-black/45">{t('demo.emision.ofHardCap')}</div>
              </div>
            </div>

            {l.status === 'LISTED' && l.deadlineAt && (
              <div className="mt-2 h-1.5 rounded-full bg-black/[.06] overflow-hidden">
                <div
                  className="h-full bg-leaf-400"
                  style={{ width: `${Math.min(100, (l.raisedUsdc / l.dossier.offeringHardCapUsdc) * 100)}%` }}
                />
              </div>
            )}

            {(l.offeringPda || l.rwaMint) && (
              <div className="mt-3 space-y-1 font-lcd text-[11px] text-black/50">
                {l.offeringPda && (
                  <div className="flex items-center gap-1.5">
                    {t('demo.emision.offeringPda')}: {shortPk(l.offeringPda)}
                    <a href={explorerAddr(l.offeringPda)} target="_blank" rel="noreferrer"
                       className="text-purple-600 hover:text-purple-800">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
                {l.rwaMint && (
                  <div className="flex items-center gap-1.5">
                    {t('demo.emision.mintT22')}: {shortPk(l.rwaMint)}
                    <a href={explorerAddr(l.rwaMint)} target="_blank" rel="noreferrer"
                       className="text-purple-600 hover:text-purple-800">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
                {l.marketAddress && (
                  <div className="flex items-center gap-1.5">
                    {t('demo.emision.marketManifest')}: {shortPk(l.marketAddress)}
                    <a href={explorerAddr(l.marketAddress)} target="_blank" rel="noreferrer"
                       className="text-purple-600 hover:text-purple-800">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3">
              <LifecycleActions listing={l} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
