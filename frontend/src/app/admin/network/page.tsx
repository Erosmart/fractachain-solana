'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';

type Deployment = {
  network?: string;
  deployer?: string;
  issuer?: string;
  porOracle?: string;
  factory?: string;
  stockVault?: string;
  licitacion?: string;
  usdcSac?: string;
  xlmSac?: string;
  updatedAt?: string;
};

export default function AdminTestnetPage() {
  const { token } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<'local' | 'faucet' | 'deploy'>('deploy');
  const [friendbot, setFriendbot] = useState(true);
  const [horizonUrl, setHorizonUrl] = useState('https://api.devnet.solana.com');
  const [rpcUrl, setRpcUrl] = useState('https://api.devnet.solana.com');
  const [notice, setNotice] = useState('');
  const [settlePolicy, setSettlePolicy] = useState<'ON_MIN' | 'ON_DATE'>('ON_MIN');
  const [settleAt, setSettleAt] = useState('');
  const [onChain, setOnChain] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null>(null);

  const load = () => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/admin/testnet`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setMode(json.data.mode || 'deploy');
          setFriendbot(json.data.friendbot !== false);
          setHorizonUrl(json.data.horizonUrl || horizonUrl);
          setRpcUrl(json.data.rpcUrl || rpcUrl);
          setSettlePolicy(json.data.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN');
          setOnChain(Boolean(json.data.onChain));
          setDeployment(json.data.deployment || null);
          if (json.data.settleAt) {
            const d = new Date(json.data.settleAt);
            const pad = (n: number) => String(n).padStart(2, '0');
            setSettleAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [token]);

  const save = async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/testnet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mode,
        friendbot,
        horizonUrl,
        rpcUrl,
        settlePolicy,
        settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.message || t('admTest.saveFail'));
      return;
    }
    setNotice(
      mode === 'deploy'
        ? onChain
          ? t('admTest.savedOn')
          : t('admTest.savedOff')
        : t('admTest.saved')
    );
  };

  const configureIssuer = async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/testnet/configure-issuer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clawback: false }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.message || t('admTest.authFail'));
      return;
    }
    setNotice(t('admTest.authDone'));
  };

  return (
    <div className="max-w-2xl space-y-6 py-6">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">Solana</p>
        <h1 className="text-3xl font-extrabold font-display">{t('admTest.title')}</h1>
        <p className="text-neutral-600 mt-1">
          {t('admTest.lead')}
        </p>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-3">
        <p className="font-display font-extrabold">{onChain ? t('admTest.onchain') : t('admTest.noContracts')}</p>
        {deployment?.factory ? (
          <dl className="space-y-1 font-mono text-xs break-all">
            {[
              ['Factory', deployment.factory],
              ['Stock vault', deployment.stockVault],
              [t('market.licitacion'), deployment.licitacion],
              [t('admTest.issuer'), deployment.issuer],
              ['Deployer', deployment.deployer],
              ['USDC mint', deployment.usdcSac],
            ].map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-neutral-500 font-sans">{label}</dt>
                  <dd>
                    {/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(String(value)) ? (
                      <a className="underline" href={`https://explorer.solana.com/address/${value}?cluster=devnet`} target="_blank" rel="noreferrer">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        ) : (
          <p className="text-sm text-neutral-600">
            {t('admTest.runHere')} <code>bash scripts/devnet/01-keys.sh && bash scripts/devnet/02-build.sh && bash scripts/devnet/03-deploy.sh</code>
          </p>
        )}
        <button type="button" onClick={configureIssuer} className="px-4 py-2 rounded-2xl border border-black/15 font-display font-bold text-sm">
          {t('admTest.authBtn')}
        </button>
      </div>
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        {[
          { id: 'local' as const, title: t('admTest.modeLocal'), body: t('admTest.modeLocalBody') },
          { id: 'faucet' as const, title: t('admTest.modeFaucet'), body: t('admTest.modeFaucetBody') },
          { id: 'deploy' as const, title: t('admTest.modeDeploy'), body: t('admTest.modeDeployBody') },
        ].map((opt) => (
          <label key={opt.id} className={`block p-4 rounded-2xl border cursor-pointer ${mode === opt.id ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" className="mr-2" checked={mode === opt.id} onChange={() => setMode(opt.id)} />
            <span className="font-display font-extrabold">{opt.title}</span>
            <p className="text-sm text-neutral-600 mt-1">{opt.body}</p>
          </label>
        ))}
        <div className="pt-2 space-y-3">
          <p className="font-display font-extrabold">{t('admTest.settleQ')}</p>
          <label className={`block p-4 rounded-2xl border cursor-pointer ${settlePolicy === 'ON_MIN' ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" className="mr-2" checked={settlePolicy === 'ON_MIN'} onChange={() => setSettlePolicy('ON_MIN')} />
            {t('admTest.onMin')}
            <p className="text-sm text-neutral-600 mt-1">{t('admTest.onMinBody')}</p>
          </label>
          <label className={`block p-4 rounded-2xl border cursor-pointer ${settlePolicy === 'ON_DATE' ? 'border-black bg-black/[0.03]' : 'border-black/10'}`}>
            <input type="radio" className="mr-2" checked={settlePolicy === 'ON_DATE'} onChange={() => setSettlePolicy('ON_DATE')} />
            {t('admTest.onDate')}
            <p className="text-sm text-neutral-600 mt-1">{t('admTest.onDateBody')}</p>
          </label>
          {settlePolicy === 'ON_DATE' && (
            <label className="block text-sm space-y-1">
              {t('admTest.closeDate')}
              <input
                type="datetime-local"
                className="w-full px-3 py-2 rounded-xl border border-black/10"
                value={settleAt}
                onChange={(e) => setSettleAt(e.target.value)}
              />
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={friendbot} onChange={(e) => setFriendbot(e.target.checked)} />
          {t('admTest.airdrop')}
        </label>
        <label className="block text-sm space-y-1">
          Solana RPC (REST)
          <input className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono text-xs" value={horizonUrl} onChange={(e) => setHorizonUrl(e.target.value)} />
        </label>
        <label className="block text-sm space-y-1">
          Solana RPC (programas)
          <input className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono text-xs" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
        </label>
        <button type="button" onClick={save} className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold">
          {t('admTest.save')}
        </button>
        {notice && <p className="text-sm">{notice}</p>}
      </div>
    </div>
  );
}
