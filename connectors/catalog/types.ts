// The catalog connector contract (tech spec 4.3, PRD D02). The sample catalog is the only
// connector in v1. A real retailer would be a new connector with this same shape, and it must
// pass the same contract tests (D19, tests/support/catalog-contract.ts).

export type Department = "womenswear" | "menswear";

/** The measurable details the preference check reads. Which ones a category needs: required-details.ts. */
export type ProductDetails = {
  /** 1 casual to 5 black tie. */
  formality: number;
  material: string;
  pattern: string;
  heelCm?: number;
  toe?: "open" | "closed";
  sleeve?: string;
  neckline?: string;
  coverage?: string;
};

export type Product = {
  /** Our own id for the product, stored in looks and the bag. */
  id: string;
  provider: string;
  /** The provider's id for the product (the slug, for the sample catalog). */
  providerProductId: string;
  department: Department;
  category: string;
  name: string;
  colors: string[];
  styleTags: string[];
  price: { amountCents: number; currency: string };
  /** One variant per size. */
  variants: { id: string; size: string }[];
  details: ProductDetails;
  image: { url: string; alt: string; rights: string };
  region: string;
  /** When the product can be bought. Always null for samples. */
  availableFrom: string | null;
  retailer: { name: string; attribution: string };
  purchaseUrl: string | null;
  /** Always false for samples (R62). */
  canBeBought: boolean;
};

export type SearchFilters = {
  department?: Department;
  categories?: string[];
  /** Keeps products that come in any of these sizes. "One size" products always match. */
  sizes?: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Keeps products with any of these style tags, ignoring case. */
  styleTags?: string[];
  /** Keeps products with any of these words in a color name, ignoring case ("green" finds "emerald green"). */
  colors?: string[];
  excludeIds?: string[];
  /** At most this many results, cheapest first. Default 100. */
  limit?: number;
};

export type Availability = {
  productId: string;
  /** Sample products are never shown as in stock (R62). */
  status: "in_stock" | "out_of_stock" | "not_for_sale" | "unknown";
  availableFrom: string | null;
};

export type Capabilities = { checkout: boolean; cartTransfer: boolean; orderTracking: boolean };

export interface CatalogConnector {
  readonly provider: string;
  capabilities(): Capabilities;
  search(filters?: SearchFilters): Promise<Product[]>;
  /** Null when there's no such product. */
  getProduct(id: string): Promise<Product | null>;
  /** One entry per id asked for, in the same order. */
  getAvailability(ids: string[]): Promise<Availability[]>;
}
