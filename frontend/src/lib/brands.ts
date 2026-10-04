export const INSTITUTION_SLOTS = [
  { slug: 'cnv', label: 'CNV' },
  { slug: 'caja-de-valores', label: 'Caja de Valores' },
  { slug: 'byma', label: 'BYMA' },
  { slug: 'solana', label: 'Solana' },
  { slug: 'manteca', label: 'Manteca' },
  { slug: 'matba-rofex', label: 'Matba Rofex' },
  { slug: 'koywe', label: 'Koywe' },
  { slug: 'circle', label: 'Circle CCTP' },
  { slug: 'superteam', label: 'Superteam Argentina' },
  { slug: 'gafi', label: 'GAFI' },
] as const;

export function partnerSlug(name: string) {
  const map: Record<string, string> = {
    BYMA: 'byma',
    'Caja de Valores': 'caja-de-valores',
    'Solana Foundation': 'solana',
    Manteca: 'manteca',
    'Matba Rofex': 'matba-rofex',
    Koywe: 'koywe',
    'Circle CCTP': 'circle',
    'Superteam · Colosseum': 'superteam',
  };
  return map[name] || name.toLowerCase().replace(/\s+/g, '-');
}
