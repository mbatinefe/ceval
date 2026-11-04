import type { CampaignOffer } from "../../shared/campaign-listings.ts";
import { wideFinds } from "./thrift-demo.ts";

export type PlaceScene = {
  id: string;
  place: string;
  line: string;
  alt: string;
  brand: string;
  model: string;
  variant: string;
  note: string;
  sourceLabel: string;
  source: CampaignOffer;
  box: [number, number, number, number];
};
const checkedAt = "2026-11-04T13:33:48.000Z";
const source = (
  value: Omit<CampaignOffer, "checkedAt" | "currency">,
): CampaignOffer => ({ ...value, checkedAt, currency: "USD" });
// Curated campaign scenes and dated source references; never account scan results.
export const places: PlaceScene[] = [
  {
    id: "tech",
    place: "Tech stores",
    line: "Before you buy.",
    alt: "Illustrated electronics shop with black Sony WH-1000XM5 headphones on a display stand.",
    brand: "Sony",
    model: "WH-1000XM5",
    variant: "Black",
    note: "Check model on the earcup",
    sourceLabel: "Sony list price",
    source: source({
      merchant: "Sony",
      title: "WH-1000XM5 · Black",
      url: "https://electronics.sony.com/audio/headphones/headband/p/wh1000xm5-b",
      image: "",
      condition: "Currently unavailable from Sony",
      referencePriceMinor: 39999,
      availability: "unavailable",
    }),
    box: [0.37, 0.12, 0.24, 0.64],
  },
  {
    id: "flea",
    place: "Flea markets",
    line: "A second look pays off.",
    alt: "Illustrated outdoor flea-market stall with a chrome Nikon FM2 camera body among vintage objects.",
    brand: "Nikon",
    model: "FM2",
    variant: "Chrome body",
    note: "Body only · Condition matters",
    sourceLabel: "Used at KEH",
    source: wideFinds[0].offers[0],
    box: [0.34, 0.24, 0.33, 0.49],
  },
  {
    id: "wardrobe",
    place: "Your wardrobe",
    line: "Already yours. Still worth a look.",
    alt: "Illustrated bedroom wardrobe with a light-wash Levi’s Trucker denim jacket hanging in the center.",
    brand: "Levi’s",
    model: "Trucker Jacket",
    variant: "Yellow Stone 72334-0683",
    note: "Confirm wash and size on the tag",
    sourceLabel: "New at Levi’s",
    source: wideFinds[3].offers[0],
    box: [0.38, 0.2, 0.25, 0.49],
  },
  {
    id: "furniture",
    place: "Furniture shops",
    line: "Know the design. Know the price.",
    alt: "Illustrated furniture showroom with a black Anglepoise Original 1227 desk lamp on a walnut desk.",
    brand: "Anglepoise",
    model: "Original 1227",
    variant: "Jet Black",
    note: "Confirm the maker on the base",
    sourceLabel: "New at Anglepoise",
    source: wideFinds[1].offers[0],
    box: [0.37, 0.08, 0.25, 0.73],
  },
  {
    id: "sneakers",
    place: "Sneaker stores",
    line: "Try them on. Check your options.",
    alt: "Illustrated sneaker boutique with a pair of all-white Nike Air Force 1 ’07 shoes on a concrete pedestal.",
    brand: "Nike",
    model: "Air Force 1 ’07",
    variant: "White CW2288-111",
    note: "Confirm style code and size",
    sourceLabel: "New at Nike",
    source: source({
      merchant: "Nike",
      title: "Air Force 1 ’07 · CW2288-111",
      url: "https://www.nike.com/t/air-force-1-07-mens-shoes-DZejrQoC/CW2288-111",
      image: "",
      condition: "White / White · Choose size",
      priceMinor: 11500,
      availability: "available",
    }),
    box: [0.32, 0.37, 0.36, 0.32],
  },
  {
    id: "books",
    place: "Bookshops",
    line: "The right book. Your price.",
    alt: "Illustrated independent bookshop with Rick Rubin’s The Creative Act hardcover on an oak display table.",
    brand: "Rick Rubin",
    model: "The Creative Act",
    variant: "Hardcover 9780593652886",
    note: "Match the ISBN and edition",
    sourceLabel: "Publisher price",
    source: source({
      merchant: "Penguin Random House",
      title: "The Creative Act · Hardcover",
      url: "https://www.penguinrandomhouse.com/books/717356/the-creative-act-by-rick-rubin/",
      image: "",
      condition: "Hardcover · ISBN 9780593652886",
      priceMinor: 3200,
      availability: "available",
    }),
    box: [0.36, 0.18, 0.26, 0.61],
  },
];
