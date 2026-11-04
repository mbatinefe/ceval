import { marketplaceSearch } from "../../shared/marketplace.ts";
import type {
  CampaignMatch,
  CampaignOffer,
} from "../../shared/campaign-listings.ts";

export type SceneBox = { x: number; y: number; width: number; height: number };
export type ThriftFind = {
  id: string;
  brand: string;
  model: string;
  name: string;
  short: string;
  variant: string;
  match: CampaignMatch;
  matchNote: string;
  offers: CampaignOffer[];
  box: SceneBox;
};
export const sceneMedia = {
  wide: { src: "/campaign/thrift/branded-wide.webp", width: 1672, height: 941 },
  portrait: {
    src: "/campaign/thrift/branded-portrait.webp",
    width: 941,
    height: 1672,
  },
};
const checkedAt = "2026-11-04T13:00:00.000Z";
const offer = (
  source: Omit<CampaignOffer, "currency" | "checkedAt">,
): CampaignOffer => ({ ...source, currency: "USD", checkedAt });
// Curated product-tour snapshots from the linked merchants, separate from account scans.
// Merchant photos remain remote and attributed by their adjacent source link.
const camera = {
  id: "camera",
  brand: "Nikon",
  model: "FM2",
  name: "Nikon FM2",
  short: "Nikon",
  variant: "Chrome body",
  match: "model" as const,
  matchNote: "35mm · Body only",
  offers: [
    offer({
      merchant: "KEH",
      title: "Nikon FM2 35mm Camera Body, Chrome",
      url: "https://www.keh.com/shop/nikon-fm2-chrome-35mm-camera-body.html",
      image:
        "https://cgi.keh.com/media/catalog/product/2/4/246489-2364327_01_r524x.jpg",
      condition: "Used · Excellent · Body only",
      priceMinor: 55500,
      availability: "available",
    }),
    offer({
      merchant: "MPB",
      title: "Nikon FM2 · SKU 3955534",
      url: "https://www.mpb.com/en-us/product/nikon-fm2/sku-3955534",
      image:
        "https://storage.googleapis.com/mpb-platform-prod-media-service-prod-y1m8/production/f2057561-0695-4829-91fd-231b0dfc64b1/Studio%20Session-60007.jpg",
      condition: "Used · Good · Body only",
      availability: "unknown",
    }),
  ],
};
const lamp = {
  id: "lamp",
  brand: "Anglepoise",
  model: "Original 1227",
  name: "Anglepoise Original 1227",
  short: "Anglepoise",
  variant: "Jet Black",
  match: "similar" as const,
  matchNote: "Jet Black · Check base label",
  offers: [
    offer({
      merchant: "Anglepoise",
      title: "Original 1227 Desk Lamp · Jet Black",
      url: "https://www.anglepoise.com/usa/product/original-1227-desk-lamp-jet-black/",
      image:
        "https://www.anglepoise.com/usa/wp-content/uploads/sites/3/2021/12/original-1227-desk-lamp-jet-black-1-1.jpg",
      condition: "New · Jet Black · US plug",
      priceMinor: 25600,
      availability: "available",
    }),
    offer({
      merchant: "HORNE",
      title: "Original 1227 Desk Lamp · Jet Black",
      url: "https://shophorne.com/products/original-1227-desk-light?variant=511786909697",
      image:
        "https://shophorne.com/cdn/shop/products/original-1227-desk-lamp-469850.jpg?v=1678754485&width=240",
      condition: "New · Jet Black · US plug",
      priceMinor: 32000,
      availability: "available",
    }),
  ],
};
const shoes = {
  id: "shoes",
  brand: "Converse",
  model: "Chuck 70 Low",
  name: "Converse Chuck 70 Low",
  short: "Converse",
  variant: "Parchment 162062C",
  match: "similar" as const,
  matchNote: "Parchment · Confirm style and size",
  offers: [
    offer({
      merchant: "Converse",
      title: "Chuck 70 Canvas · 162062C",
      url: "https://www.converse.com/shop/p/chuck-70-canvas-unisex-low-top-shoe/162062C.html",
      image:
        "https://www.karenwalker.com/cdn/shop/files/converse-chuck-taylor-all-star-70-low-top-parchment-162062-parchmentgarnetegret-front-0250542001611101284_3cc78a31-b1b6-4adc-a8d8-b1af6e9476e5.jpg?v=1724545526&width=240",
      imageCredit: "Product photo: Karen Walker · Style 162062C",
      condition: "New · Choose size",
      priceMinor: 9000,
      availability: "available",
    }),
    offer({
      merchant: "Karen Walker",
      title: "Chuck 70 Low Top Parchment · US M7 / W9",
      url: "https://www.karenwalker.com/en-us/products/converse-chuck-70-low-top-parchment?variant=44137514041509",
      image:
        "https://www.karenwalker.com/cdn/shop/files/converse-chuck-taylor-all-star-70-low-top-parchment-162062-parchmentgarnetegret-front-0250542001611101284_3cc78a31-b1b6-4adc-a8d8-b1af6e9476e5.jpg?v=1724545526&width=240",
      condition: "New · M7/W9 · Import fees may apply",
      priceMinor: 7500,
      availability: "available",
    }),
  ],
};
const jacket = {
  id: "jacket",
  brand: "Levi’s",
  model: "Trucker Jacket",
  name: "Levi’s Trucker Jacket",
  short: "Levi’s",
  variant: "Yellow Stone 72334-0683",
  match: "similar" as const,
  matchNote: "Confirm wash and size on the tag",
  offers: [
    offer({
      merchant: "Levi’s",
      title: "Trucker Jacket · Yellow Stone · 72334-0683",
      url: "https://www.levi.com/US/en_US/clothing/men/outerwear/trucker-jacket/p/723340683",
      image:
        "https://lscoglobal.scene7.com/is/image/lscoglobal/MT_72334-0683_GLO_CM_FV?fit=crop%2C1&fmt=jpeg&hei=300&qlt=75&wid=240",
      condition: "New · Yellow Stone · Choose size",
      priceMinor: 6698,
      availability: "available",
    }),
  ],
};
export const wideFinds: ThriftFind[] = [
  {
    ...camera,
    match: "similar",
    matchNote: "FM2 candidate · Check front badge",
    box: { x: 0.16, y: 0.496, width: 0.13, height: 0.172 },
  },
  { ...lamp, box: { x: 0.267, y: 0.199, width: 0.151, height: 0.425 } },
  { ...shoes, box: { x: 0.382, y: 0.482, width: 0.199, height: 0.162 } },
  { ...jacket, box: { x: 0.438, y: 0.068, width: 0.179, height: 0.411 } },
];
export const portraitFinds: ThriftFind[] = [
  { ...camera, box: { x: 0.16, y: 0.56, width: 0.29, height: 0.12 } },
  { ...lamp, box: { x: 0.235, y: 0.268, width: 0.35, height: 0.338 } },
  { ...shoes, box: { x: 0.535, y: 0.534, width: 0.405, height: 0.15 } },
  { ...jacket, box: { x: 0.55, y: 0.115, width: 0.445, height: 0.39 } },
];
export function shoppingSearches(find: ThriftFind) {
  return {
    marketplace: marketplaceSearch({
      brand: find.brand,
      model: find.model,
      variant: find.variant,
    }),
  };
}
