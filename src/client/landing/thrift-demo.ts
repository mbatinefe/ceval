import { marketplaceSearch } from "../../shared/marketplace";

export type SceneBox = { x: number; y: number; width: number; height: number };
export type ThriftFind = {
  id: string;
  name: string;
  short: string;
  query: string;
  examples: [number, number];
  box: SceneBox;
};
export const sceneMedia = {
  wide: { src: "/campaign/thrift/shop-wide.webp", width: 1672, height: 941 },
  portrait: {
    src: "/campaign/thrift/shop-portrait.webp",
    width: 941,
    height: 1672,
  },
};
// Illustrative campaign data. These are search destinations, never retrieved offers.
const camera = {
  id: "camera",
  name: "Vintage film camera",
  short: "Camera",
  query: "vintage 35mm film camera",
  examples: [85, 110] as [number, number],
};
const shoes = {
  id: "shoes",
  name: "Cream canvas sneakers",
  short: "Sneakers",
  query: "cream canvas sneakers used",
  examples: [28, 42] as [number, number],
};
const jacket = {
  id: "jacket",
  name: "Vintage denim jacket",
  short: "Jacket",
  query: "vintage blue denim jacket",
  examples: [38, 65] as [number, number],
};
export const wideFinds: ThriftFind[] = [
  { ...camera, box: { x: 0.173, y: 0.508, width: 0.113, height: 0.14 } },
  {
    id: "lamp",
    name: "Green enamel desk lamp",
    short: "Lamp",
    query: "vintage green enamel desk lamp",
    examples: [45, 72],
    box: { x: 0.298, y: 0.313, width: 0.126, height: 0.294 },
  },
  { ...shoes, box: { x: 0.397, y: 0.488, width: 0.17, height: 0.156 } },
  {
    id: "bag",
    name: "Leather shoulder bag",
    short: "Bag",
    query: "vintage brown leather shoulder bag",
    examples: [48, 75],
    box: { x: 0.586, y: 0.427, width: 0.184, height: 0.2 },
  },
  {
    id: "vase",
    name: "Blue ceramic vase",
    short: "Vase",
    query: "blue glazed ceramic vase vintage",
    examples: [24, 38],
    box: { x: 0.78, y: 0.383, width: 0.095, height: 0.24 },
  },
  { ...jacket, box: { x: 0.435, y: 0.065, width: 0.19, height: 0.408 } },
];
export const portraitFinds: ThriftFind[] = [
  { ...camera, box: { x: 0.202, y: 0.521, width: 0.278, height: 0.116 } },
  {
    id: "pitcher",
    name: "Glazed ceramic pitcher",
    short: "Pitcher",
    query: "vintage green glazed ceramic pitcher",
    examples: [24, 39],
    box: { x: 0.416, y: 0.412, width: 0.23, height: 0.17 },
  },
  { ...shoes, box: { x: 0.548, y: 0.506, width: 0.315, height: 0.15 } },
  {
    id: "chair",
    name: "Bentwood café chair",
    short: "Chair",
    query: "vintage bentwood cafe chair",
    examples: [55, 95],
    box: { x: 0.091, y: 0.244, width: 0.345, height: 0.288 },
  },
  { ...jacket, box: { x: 0.585, y: 0.119, width: 0.41, height: 0.405 } },
];
export function shoppingSearches(find: ThriftFind) {
  const ebay = new URL("https://www.ebay.com/sch/i.html");
  ebay.searchParams.set("_nkw", find.query);
  const etsy = new URL("https://www.etsy.com/search");
  etsy.searchParams.set("q", find.query);
  return {
    ebay: ebay.href,
    etsy: etsy.href,
    marketplace: marketplaceSearch({
      brand: "",
      model: "",
      variant: "",
      label: find.query,
    }),
  };
}
