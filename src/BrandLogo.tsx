import React from "react";

export const klarwerkLogo = "/images/klarwerk.png";
export default function BrandLogo({
  size = 32,
  label = "",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <img
      src={klarwerkLogo}
      alt={label}
      width={size}
      height={size}
      className="klarwerk-logo"
      decoding="async"
    />
  );
}
