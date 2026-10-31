import { formatPrice } from "../../shared/demo";

// Prices are set like shelf labels: small currency and cents, tall numerals.
export function Price({
  minor,
  currency = "USD",
  className = "",
}: {
  minor: number;
  currency?: string;
  className?: string;
}) {
  const text = formatPrice(minor, currency);
  let parts: Intl.NumberFormatPart[];
  try {
    parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).formatToParts(minor / 100);
  } catch {
    return <span className={className}>{text}</span>;
  }
  const pick = (...types: Intl.NumberFormatPartTypes[]) =>
    parts
      .filter((part) => types.includes(part.type))
      .map((part) => part.value)
      .join("");
  const cents = pick("fraction");
  return (
    <span className={`price ${className}`.trim()}>
      <span className="sr-only">{text}</span>
      <span className="price-cur" aria-hidden="true">
        {pick("currency")}
      </span>
      <span className="price-whole" aria-hidden="true">
        {pick("minusSign", "integer", "group")}
      </span>
      {cents && (
        <span className="price-cents" aria-hidden="true">
          {cents}
        </span>
      )}
    </span>
  );
}
