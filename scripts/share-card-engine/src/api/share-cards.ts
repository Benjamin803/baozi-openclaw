// Baozi Share Card API — generates card images and links
// Card endpoint: GET https://baozi.bet/api/share/card?market=PDA&wallet=WALLET&ref=CODE

const SHARE_CARD_API = "https://baozi.bet/api/share/card";
const BAOZI_BASE = "https://baozi.bet";

export interface ShareCardOptions {
  marketPda: string;
  wallet?: string;
  affiliateCode?: string;
}

// Build share card image URL
export function shareCardUrl(opts: ShareCardOptions): string {
  const params = new URLSearchParams({ market: opts.marketPda });
  if (opts.wallet) params.set("wallet", opts.wallet);
  if (opts.affiliateCode) params.set("ref", opts.affiliateCode);
  return `${SHARE_CARD_API}?${params}`;
}

// Build market page URL with optional affiliate
export function marketUrl(marketPda: string, ref?: string): string {
  const base = `${BAOZI_BASE}/market/${marketPda}`;
  return ref ? `${base}?ref=${ref}` : base;
}

// Build labs page URL
export function labsUrl(ref?: string): string {
  return ref ? `${BAOZI_BASE}/labs?ref=${ref}` : `${BAOZI_BASE}/labs`;
}

// Download share card image to a file
export async function downloadShareCard(
  opts: ShareCardOptions,
  outputPath: string
): Promise<boolean> {
  try {
    const url = shareCardUrl(opts);
    const resp = await fetch(url);
    if (!resp.ok) return false;

    const buffer = await resp.arrayBuffer();
    const { writeFileSync } = await import("fs");
    writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}
