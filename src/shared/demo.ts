export type ScanMode = "buy" | "resale";
export type DemoProduct = {
  id: string;
  brand: string;
  model: string;
  category: string;
  color: string;
  storePriceMinor: number;
  currency: "USD";
  point: { x: number; y: number };
};
export const demoProducts: DemoProduct[] = [
  {
    id: "sony-xm5",
    brand: "Sony",
    model: "WH-1000XM5",
    category: "Wireless headphones",
    color: "Black",
    storePriceMinor: 29999,
    currency: "USD",
    point: { x: 0.31, y: 0.28 },
  },
  {
    id: "logitech-mx3s",
    brand: "Logitech",
    model: "MX Master 3S",
    category: "Wireless mouse",
    color: "Graphite",
    storePriceMinor: 9999,
    currency: "USD",
    point: { x: 0.78, y: 0.3 },
  },
  {
    id: "jbl-flip6",
    brand: "JBL",
    model: "Flip 6",
    category: "Portable speaker",
    color: "Black",
    storePriceMinor: 12999,
    currency: "USD",
    point: { x: 0.54, y: 0.7 },
  },
];
export type SavedFind = {
  id: string;
  productId: string;
  mode: ScanMode;
  createdAt: number;
  product: DemoProduct;
};
export type Profile = {
  user: { id: string; email: string; name: string };
  capabilities: { liveScanning: false; demo: true };
};
export function formatPrice(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
}
