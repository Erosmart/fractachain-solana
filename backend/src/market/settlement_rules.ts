/**
 * Decision table for the automatic settlement, kept free of RPC and storage so
 * it can be tested: the expensive part (una llamada RPC) only runs when
 * the listing is an open on-chain offering.
 */
export type SettlementAction =
  | 'settle_holders'
  | 'settle_on_chain'
  | 'check_chain'
  | 'skip';

export function settlementAction(input: {
  status: string;
  onChain: boolean;
}): SettlementAction {
  // Closed on-chain offerings still need distribute()/refund() retries — never
  // the sandbox ledger path (that would mark ATA delivery without the crank).
  if (input.status === 'CLOSED_SUCCESS' || input.status === 'CLOSED_FAILED') {
    if (input.onChain) return 'settle_on_chain';
    return input.status === 'CLOSED_SUCCESS' ? 'settle_holders' : 'skip';
  }
  // A sandbox offering closes through its own settlement policy; forcing a
  // close here would shut every open demo listing on the first contribution.
  if (input.status === 'LISTED' && input.onChain) return 'check_chain';
  return 'skip';
}
