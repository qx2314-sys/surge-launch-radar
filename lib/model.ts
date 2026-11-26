// Surge Launch Radar — the model behind the "newest and fastest" board.
//
// The board ranks pre-token protocols by what a launch would be worth, but it
// prices them the way a surge hunter would: recent launches set the price, a
// fast week counts extra, and the newest protocols rank highest.
//
//   multiple  = the median market-cap-to-TVL of the live-token protocols in the
//               same category that launched within the last two years (at least
//               three of them). When a category has too few recent launches, it
//               falls back to the median of all its live-token protocols, and
//               then to the global median. Clamped to [0.05, 1.20].
//   growth    = the 7-day TVL change, clamped to [-30, +150] per cent, counted
//               at weight 1.5: a hot week moves the score more than a quiet one.
//   recency   = the inverse of a maturity curve. It is 1.00 on the day a protocol
//               is first listed and slides to 0.60 by day 720, then stays there:
//               a protocol that only just appeared is the most surge-shaped,
//               and one that has waited two years is priced as a slow burner.
//               Age unknown: 365 days.
//   chains    = 1 + 0.04 per extra chain, capped at 4 extra chains.
//   implied   = max(1, round(tvl_usd x multiple x growth x recency x chains))
//
// Nothing is special-cased by name. Every row is scored by the same four
// factors, and the dashboard shows each factor so the ranking can be checked.
// Say "records no token", never "has no token": the record is not proof.

/** One protocol exactly as the sealed snapshot carries it: ten fields, no more. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The surge model's constants, as the dashboard states them. */
export interface SurgeConstants {
  /** How recent a live-token launch must be to set its category's price. */
  recent_days: number;
  /** How many recent launches a category needs before its own median is used. */
  recent_min_comps: number;
  /** The smallest and largest multiple the market may set. */
  multiple_floor: number;
  multiple_cap: number;
  /** How hard the 7-day TVL change counts. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** The recency curve: 1.00 at listing, floor reached by recency_days. */
  recency_floor: number;
  recency_days: number;
  unknown_age_days: number;
  /** The per-extra-chain bonus, capped at chain_bonus_cap chains. */
  chain_bonus: number;
  chain_bonus_cap: number;
}

export const MODEL: SurgeConstants = {
  recent_days: 730,
  recent_min_comps: 3,
  multiple_floor: 0.05,
  multiple_cap: 1.2,
  growth_weight: 1.5,
  growth_floor: -30,
  growth_cap: 150,
  recency_floor: 0.6,
  recency_days: 720,
  unknown_age_days: 365,
  chain_bonus: 0.04,
  chain_bonus_cap: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-surge';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comps: number;
    recent_comps: number;
    multiple_basis: 'recent' | 'category' | 'global';
    growth_pct: number;
    growth_multiplier: number;
    recency_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_comps: number;
  recent_comps: number;
  multiple_basis: 'recent' | 'category' | 'global';
  growth_multiplier: number;
  recency_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  /** Its own market-cap-to-TVL ratio — one of the numbers the model learns from. */
  multiple: number | null;
  /** Whether it launched recently enough to set a category's surge multiple. */
  recent: boolean;
}

/** One category's multiple, for the dashboard's model view. */
export interface CategoryMultiple {
  category: string;
  recent_comps: number;
  category_comps: number;
  recent_median: number | null;
  category_median: number | null;
  used_multiple: number;
  basis: 'recent' | 'category' | 'global';
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: SurgeConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  categories: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `from` to `to`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A name ending in a release marker is a pool of another protocol, not a launch of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product of another protocol's token. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A name carrying one of these whole words is a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 *  staked or bridged product of a token that already trades, not an exchange,
 *  not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The market's own multiples, priced by recent launches. For every category:
 * the median market-cap-to-TVL of its live-token protocols that launched within
 * `recent_days` (at least `recent_min_comps` of them); failing that, the median
 * of all its live-token protocols; failing that, the global median. All
 * multiples are clamped to [floor, cap].
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: SurgeConstants = MODEL,
): {
  byCategory: Map<string, number>;
  basis: Map<string, 'recent' | 'category' | 'global'>;
  recentComps: Map<string, number>;
  comps: Map<string, number>;
  global: number;
  table: CategoryMultiple[];
} {
  const recentByCat = new Map<string, number[]>();
  const allByCat = new Map<string, number[]>();
  const all: number[] = [];
  const recentAll: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const isRecent = age !== null && age <= model.recent_days;
    if (isRecent) recentAll.push(ratio);
    if (p.category === null) continue;
    const list = allByCat.get(p.category) ?? [];
    list.push(ratio);
    allByCat.set(p.category, list);
    if (isRecent) {
      const rlist = recentByCat.get(p.category) ?? [];
      rlist.push(ratio);
      recentByCat.set(p.category, rlist);
    }
  }
  const clamp = (m: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const byCategory = new Map<string, number>();
  const basis = new Map<string, 'recent' | 'category' | 'global'>();
  const recentComps = new Map<string, number>();
  const comps = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  const categories = [...allByCat.keys()].sort();
  for (const category of categories) {
    const values = allByCat.get(category)!;
    const recent = recentByCat.get(category) ?? [];
    const n = values.length;
    comps.set(category, n);
    recentComps.set(category, recent.length);
    if (recent.length >= model.recent_min_comps) {
      const med = median(recent);
      byCategory.set(category, clamp(med));
      basis.set(category, 'recent');
      table.push({
        category,
        recent_comps: recent.length,
        category_comps: n,
        recent_median: round4(med),
        category_median: round4(median(values)),
        used_multiple: clamp(med),
        basis: 'recent',
      });
    } else if (n >= model.recent_min_comps) {
      const med = median(values);
      byCategory.set(category, clamp(med));
      basis.set(category, 'category');
      table.push({
        category,
        recent_comps: recent.length,
        category_comps: n,
        recent_median: recent.length > 0 ? round4(median(recent)) : null,
        category_median: round4(med),
        used_multiple: clamp(med),
        basis: 'category',
      });
    } else {
      byCategory.set(category, global);
      basis.set(category, 'global');
      table.push({
        category,
        recent_comps: recent.length,
        category_comps: n,
        recent_median: recent.length > 0 ? round4(median(recent)) : null,
        category_median: round4(median(values)),
        used_multiple: global,
        basis: 'global',
      });
    }
  }
  return { byCategory, basis, recentComps, comps, global, table };
}

/** The recency multiplier: 1.00 on listing day, sliding to the floor by `recency_days`. */
export function recencyMultiplier(age: number | null, model: SurgeConstants = MODEL): number {
  const a = age ?? model.unknown_age_days;
  const past = Math.min(a, model.recency_days);
  return 1 - ((1 - model.recency_floor) * past) / model.recency_days;
}

/** The chain-breadth multiplier: a little more for each extra chain, capped. */
export function chainMultiplier(chains: number, model: SurgeConstants = MODEL): number {
  return 1 + model.chain_bonus * Math.min(Math.max(chains - 1, 0), model.chain_bonus_cap);
}

/** The multipliers and the implied value one protocol gets under the surge model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: Map<string, number>,
  bases: Map<string, 'recent' | 'category' | 'global'>,
  recentComps: Map<string, number>,
  globalMultiple: number,
  model: SurgeConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  categoryComps: number;
  recentComps: number;
  basis: 'recent' | 'category' | 'global';
  growthPct: number;
  growthMult: number;
  recencyMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const recencyMult = recencyMultiplier(age, model);
  const chainMult = chainMultiplier(protocol.chains.length, model);
  const categoryMultiple =
    protocol.category !== null && multiples.has(protocol.category)
      ? multiples.get(protocol.category)!
      : globalMultiple;
  const basis =
    protocol.category !== null && bases.has(protocol.category) ? bases.get(protocol.category)! : 'global';
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * recencyMult * chainMult));
  return {
    implied,
    categoryMultiple,
    categoryComps: 0,
    recentComps: 0,
    basis,
    growthPct,
    growthMult,
    recencyMult,
    chainMult,
    age,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: SurgeConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const { byCategory, basis, recentComps, comps, global } = categoryMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its record.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The surge radar: pre-token protocols below the watchlist floor, by TVL, that
  // are genuinely still waiting on a launch. A chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, byCategory, basis, recentComps, global, model);
    return {
      p,
      ...v,
      categoryComps: p.category !== null ? (comps.get(p.category) ?? 0) : 0,
      recentComps: p.category !== null ? (recentComps.get(p.category) ?? 0) : 0,
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.categoryMultiple),
      category_comps: s.categoryComps,
      recent_comps: s.recentComps,
      multiple_basis: s.basis,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      recency_multiplier: round4(s.recencyMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Write the dates and the transaction hash in a farm log.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 60;
}

/** How long to hold: newer protocols need a longer qualifying window, because
 *  their snapshots are still sparse; older ones are already well recorded. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 90) return 45;
  if (age < 365) return 30;
  return 21;
}

/** The category's first action, written for speed: surge farms are won in days. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Move fast: put $${capital} of USDC into ${name} on ${chain} within a day of finding it, and leave the supply working so the next snapshot catches it.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Move fast: add $${capital} of liquidity to ${name}'s deepest pool on ${chain} today, and leave the position in place for the snapshots to come.`;
  if (c.includes('yield aggregator') || c.includes('curator') || c.includes('allocator'))
    return `Move fast: drop $${capital} into a ${name} vault on ${chain} now, and keep the shares while the vault compounds.`;
  if (c.includes('yield'))
    return `Move fast: place $${capital} of USDC in ${name}'s largest strategy on ${chain} today, and let it earn while the protocol is still new.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Move fast: post $${capital} of USDC as margin on ${name} on ${chain} and open one small position the same day, so the account shows activity early.`;
  if (c.includes('prediction'))
    return `Move fast: fund $${capital} on ${name} on ${chain} and take one position on a market you have actually read, the same week you find it.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Move fast: stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('stable'))
    return `Move fast: mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep it there.`;
  if (c.includes('rwa'))
    return `Move fast: mint $${capital} of ${name}'s yield-bearing asset on ${chain} while the issuance is still young.`;
  if (c.includes('index'))
    return `Move fast: buy $${capital} of ${name}'s index token on ${chain} and hold it through the next snapshots.`;
  if (c.includes('privacy'))
    return `Move fast: deposit $${capital} through ${name}'s private pool on ${chain} and keep the withdrawal note somewhere safe.`;
  if (c.includes('ai agent'))
    return `Move fast: fund $${capital} into ${name} on ${chain} and run your first agent task this week.`;
  if (c.includes('insurance'))
    return `Move fast: buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Move fast: bridge $${capital} of USDC to ${chain} through ${name} and put the bridged funds to work in its app the same day.`;
  return `Move fast: deposit $${capital} of USDC into ${name} on ${chain} within a day, and leave the position open.`;
}

/** The category's second qualifying action: a different feature, done quickly. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow a small sum, about $${Math.max(10, Math.round(capital / 5))}, against the supply and repay it inside a week, so the protocol sees both sides early.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Swap once through ${name}'s router on ${chain} for a token you already hold, using the same pool you supplied to.`;
  if (c.includes('yield aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('yield'))
    return `Shift a quarter of the deposit into a second ${name} vault or strategy on ${chain} within the first week, so the position spans two products.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Close the first position after a few days, then open a second one the other way with the same margin, so the account shows two settled trades.`;
  if (c.includes('prediction'))
    return `Settle the first market, then take a second position on a different market on ${name} the same week.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Claim whatever staking rewards ${name} shows on ${chain} and restake them instead of withdrawing.`;
  if (c.includes('stable'))
    return `Swap half the stable balance for USDC on ${chain} and back again through ${name}, so the account shows mint and swap activity.`;
  if (c.includes('rwa'))
    return `Open ${name}'s redemption page on ${chain} and redeem a small slice, about $${Math.max(10, Math.round(capital / 10))}, to prove the exit works.`;
  if (c.includes('index'))
    return `Rebalance once: sell a tenth of the index token and buy it back through ${name} on ${chain}.`;
  if (c.includes('privacy'))
    return `Withdraw a small amount from the private pool and deposit it again, keeping the new note beside the old one.`;
  if (c.includes('ai agent'))
    return `Run a second, different agent task on ${name} and save the task receipt or transaction hash.`;
  if (c.includes('insurance'))
    return `Get a test quote for a second cover type on ${name} so the account shows more than one policy interaction.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge a small amount, about $${Math.max(10, Math.round(capital / 5))}, back to the chain you started from through ${name}.`;
  return `Use a second feature of ${name} on ${chain} — its swap, vote or rewards page — so the account shows more than one kind of activity.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Surge plans are built for
 * speed: the first two actions happen within days, and activity stays frequent.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const gas = capital >= 200 ? 10 : 5;
  return [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper, never in a screenshot or a chat. Surge moves are quick, and a clean wallet is what makes them safe.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${gas} of gas, on top of the $${capital} already in the position`,
      time: '10 minutes',
    },
    {
      text: `Do a qualifying action every few days, not once a week: a deposit, a borrow, a swap or a vote. New protocols take snapshots often, and gaps cost you.`,
      cost: 'about $2 of gas each time',
      time: '10 minutes every few days',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not pull out early for a small gain.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw anything, open the protocol's own points or rewards page from its official site or docs and check what it counts, and write down the dates it counts.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `If a token launches, claim only from the link the protocol itself publishes, never from a reply, a direct message or a search ad, and never pay anyone to claim for you.`,
      cost: 'gas for the claim only, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, and when you unwind, withdraw half first, check the gas, then the rest.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, 15 minutes to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const asOf = snapshot.as_of;
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => {
      const age = ageDays(asOf, p.listed_at);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
        multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
        recent: age !== null && age <= MODEL.recent_days,
      };
    });
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_comps: row.model.category_comps,
    recent_comps: row.model.recent_comps,
    multiple_basis: row.model.multiple_basis,
    growth_multiplier: row.model.growth_multiplier,
    recency_multiplier: row.model.recency_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: SurgeConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { global, table } = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: global,
    categories: table,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
