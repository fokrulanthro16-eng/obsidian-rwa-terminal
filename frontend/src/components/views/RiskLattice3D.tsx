"use client";

import React from "react";
import dynamic from "next/dynamic";
import { RWAAsset } from "@/types";

interface RiskLattice3DProps {
  assets: RWAAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const DynamicCanvas = dynamic(
  () =>
    import("./RiskLatticeCanvas").then((mod) => mod.RiskLatticeCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#08090C] flex items-center justify-center font-mono text-xs text-[#6B7280]">
        INITIALIZING 3D RISK LATTICE MATRIX...
      </div>
    ),
  }
);

export const RiskLattice3D: React.FC<RiskLattice3DProps> = (props) => {
  return <DynamicCanvas {...props} />;
};
