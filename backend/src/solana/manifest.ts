import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getConnection } from './connection';
import { adminKeypair } from './keys';
import { ixAuthorizeMarketVault, TOKEN_2022_PROGRAM_ID } from './program';
import { sendIxs } from './tx';

/**
 * Manifest CLOB integration — the Solana replacement for the Stellar DEX
 * (sdex.ts / sdex_book.ts).
 *
 * The SDK (`@cks-systems/manifest-sdk`) is loaded lazily so the backend
 * compiles and the sandbox book keeps working before `npm i` of the SDK —
 * SETUP_SOLANA.md covers installing it.
 */

export const MANIFEST_PROGRAM_ID = new PublicKey(
  'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
);

let sdkPromise: Promise<any> | null = null;

function sdk() {
  if (!sdkPromise) {
    sdkPromise = import('@cks-systems/manifest-sdk').catch((err) => {
      throw new Error(
        'Manifest SDK no instalado: npm i @cks-systems/manifest-sdk (ver SETUP_SOLANA.md)',
      );
    });
  }
  return sdkPromise;
}

export interface ManifestMarketInfo {
  market: string;
  baseMint: string;
  quoteMint: string;
}

/** Creates a Manifest market for (rwaMint, paymentMint) — server-signed. */
export async function createMarket(
  baseMint: PublicKey,
  quoteMint: PublicKey,
): Promise<ManifestMarketInfo> {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  const admin = adminKeypair();
  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    conn,
    admin.publicKey,
  );
  const ixs: TransactionInstruction[] = await client.createMarketWithOptsIx({
    baseMint,
    quoteMint,
    baseTokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  const sig = await sendIxs(admin, [], ixs);
  // The market address is derivable from the ix accounts — SDK exposes it
  // via getMarketForMints; keep the signature as the audit trail.
  const market = await getMarketForMints(baseMint, quoteMint).catch(() => null);
  return {
    market: market || '',
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
  };
}

/** Thaws the freshly created Token-2022 vault — required before deposits. */
export async function authorizeVault(
  listingId: string,
  vault: PublicKey,
): Promise<string> {
  const admin = adminKeypair();
  return sendIxs(admin, [], [
    ixAuthorizeMarketVault(admin.publicKey, listingId, vault),
  ]);
}

export async function getMarketForMints(
  baseMint: PublicKey,
  quoteMint: PublicKey,
): Promise<string | null> {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  const addr = await ManifestClient.getMarketForMints(conn, baseMint, quoteMint);
  return addr?.toBase58?.() || null;
}

export interface OrderLevel {
  price: number;
  quantity: number;
}

export interface ManifestBook {
  market: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
}

export async function getBook(marketAddress: string): Promise<ManifestBook> {
  const { Market } = await sdk();
  const conn = getConnection();
  const market = await Market.loadFromAddress({
    connection: conn,
    address: new PublicKey(marketAddress),
  });
  await market.reload();
  const bids: OrderLevel[] = market.bids().map((o: any) => ({
    price: Number(o.tokenPrice?.toString?.() ?? o.price),
    quantity: Number(o.numBaseTokens?.toString?.() ?? o.size),
  }));
  const asks: OrderLevel[] = market.asks().map((o: any) => ({
    price: Number(o.tokenPrice?.toString?.() ?? o.price),
    quantity: Number(o.numBaseTokens?.toString?.() ?? o.size),
  }));
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  return {
    market: marketAddress,
    bids,
    asks,
    bestBid,
    bestAsk,
    midPrice: bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null,
    spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
  };
}

/** Wallet-side instructions for placing an order (self-custody flow). */
export async function placeOrderIxs(params: {
  market: string;
  trader: PublicKey;
  side: 'buy' | 'sell';
  numBaseTokens: number;
  price: number;
  isMaker?: boolean;
}): Promise<TransactionInstruction[]> {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    conn,
    params.trader,
  );
  const ixs: TransactionInstruction[] = [];
  if (params.side === 'buy') {
    ixs.push(
      ...(await client.placeOrderIx(
        new PublicKey(params.market),
        {
          numBaseTokens: params.numBaseTokens,
          tokenPrice: params.price,
          isBid: true,
          lastValidSlot: 0,
          orderType: 0, // Limit
        } as any,
      )),
    );
  } else {
    ixs.push(
      ...(await client.placeOrderIx(
        new PublicKey(params.market),
        {
          numBaseTokens: params.numBaseTokens,
          tokenPrice: params.price,
          isBid: false,
          lastValidSlot: 0,
          orderType: 0,
        } as any,
      )),
    );
  }
  return ixs;
}

export async function cancelOrderIxs(params: {
  market: string;
  trader: PublicKey;
  clientOrderId: bigint;
}): Promise<TransactionInstruction[]> {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    conn,
    params.trader,
  );
  return client.cancelOrderIx(
    new PublicKey(params.market),
    { clientOrderId: params.clientOrderId } as any,
  ) as unknown as TransactionInstruction[];
}

/** All resting orders of one trader on one market. */
export async function traderOrders(marketAddress: string, trader: PublicKey) {
  const { Market } = await sdk();
  const conn = getConnection();
  const market = await Market.loadFromAddress({
    connection: conn,
    address: new PublicKey(marketAddress),
  });
  await market.reload();
  const bids: OrderLevel[] = market
    .bids()
    .filter((o: any) => o.trader?.equals?.(trader))
    .map((o: any) => ({ price: Number(o.tokenPrice), quantity: Number(o.numBaseTokens) }));
  const asks: OrderLevel[] = market
    .asks()
    .filter((o: any) => o.trader?.equals?.(trader))
    .map((o: any) => ({ price: Number(o.tokenPrice), quantity: Number(o.numBaseTokens) }));
  return { bids, asks };
}
