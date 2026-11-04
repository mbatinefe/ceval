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
      className="market-links"
      role="group"
      aria-label={`Search marketplaces for ${name}`}
    >
      <span className="market-links-label">Search marketplaces</span>
      <a
        className="cinema-marketplace-primary"
        href={links.marketplace}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={facebookLogo} width={22} height={22} alt="" />
        <span>
          <b>Facebook Marketplace</b>
          <small>Search nearby</small>
        </span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      <div className="market-links-more">
        <a
          href={links.ebay}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search eBay for ${name}`}
        >
          eBay <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <a
          href={links.etsy}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search Etsy for ${name}`}
        >
          Etsy <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
