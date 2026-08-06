import { CATALOGUE } from '../generated/catalogue';

/** The SPRS methodology starts every assessment at 110 and deducts. */
export const MAX_SCORE = 110;

/**
 * Derived from the catalogue at module init — deliberately NOT a literal.
 * If the data ever changes, the floor moves with it and the invariant tests
 * catch the drift rather than a hard-coded -203 quietly becoming wrong.
 */
export const TOTAL_WEIGHT: number = CATALOGUE.reduce((n, r) => n + r.weight, 0);

/** 110 - 313 = -203 for the Rev 2 catalogue. */
export const MIN_SCORE: number = MAX_SCORE - TOTAL_WEIGHT;

export const REQUIREMENT_COUNT: number = CATALOGUE.length;
