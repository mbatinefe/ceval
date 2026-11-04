import { ArrowUpRight } from "lucide-react";
import facebookLogo from "../assets/facebook.png";
import { shoppingSearches, type ThriftFind } from "./thrift-demo";

export function MarketplaceLinks({
  product,
}: {
  product: Pick<ThriftFind, "brand" | "model" | "variant">;
}) {
  const links = shoppingSearches(product);
  return (
    <div className="cinema-market-links" aria-label="Search marketplaces">
      <a
        className="cinema-marketplace-primary"
        href={links.marketplace}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={facebookLogo} width={34} height={34} alt="Facebook" />
        <span>
          <b>Facebook Marketplace</b>
          <small>Search this model nearby</small>
        </span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </a>
      <div className="cinema-secondary-markets">
        <a
          href={links.ebay}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search eBay for ${product.brand} ${product.model}`}
        >
          <span className="cinema-ebay-word" aria-hidden="true">
            <i>e</i>
            <i>b</i>
            <i>a</i>
            <i>y</i>
          </span>
          <span>Search</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <a
          href={links.etsy}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search Etsy for ${product.brand} ${product.model}`}
        >
          <span className="cinema-etsy-word" aria-hidden="true">
            Etsy
          </span>
          <span>Search</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
