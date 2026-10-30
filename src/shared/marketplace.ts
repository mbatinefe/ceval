import type { Product } from "./scan.ts";

export function marketplaceSearch(
  product: Pick<Product, "brand" | "model" | "variant">,
) {
  const url = new URL("https://www.facebook.com/marketplace/search/");
  url.searchParams.set(
    "query",
    [product.brand, product.model, product.variant].filter(Boolean).join(" "),
  );
  return url.href;
}
