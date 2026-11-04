import { ArrowUpRight } from "lucide-react";
import facebookLogo from "../assets/facebook.png";
import { shoppingSearches, type ThriftFind } from "./thrift-demo";

export function MarketplaceLinks({
  product,
}: {
  product: Pick<ThriftFind, "brand" | "model" | "variant">;
}) {
  const links = shoppingSearches(product);
  const name = `${product.brand} ${product.model}`;
  return (
    <div
      className="market"
      role="group"
      aria-label={`Search marketplaces for ${name}`}
    >
      <span className="market-label">Search marketplaces</span>
      <div className="market-links">
        <a href={links.marketplace} target="_blank" rel="noopener noreferrer">
          <img src={facebookLogo} width={18} height={18} alt="" />
          Facebook Marketplace
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <a
          href={links.ebay}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search eBay for ${name}`}
        >
          eBay <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <a
          href={links.etsy}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search Etsy for ${name}`}
        >
          Etsy <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
