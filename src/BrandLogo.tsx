import React from "react";

export const klarwargLogo = "/images/klarwarg.png";
export default function BrandLogo({
  size = 32,
  label = "",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <img
      src={klarwargLogo}
      alt={label}
      width={size}
      height={size}
      className="klarwarg-logo"
      decoding="async"
    />
  );
}
