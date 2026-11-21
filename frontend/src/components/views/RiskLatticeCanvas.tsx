"use client";

import React, { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { RWAAsset } from "@/types";

interface RiskLatticeCanvasProps {
  assets: RWAAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

// Convert asset metrics to 3D coordinate space
// X: Liquidity Turnover (0.0 to 0.25 -> mapped to -8 to +8)
// Y: Risk Score (0 to 100 -> mapped to -6 to +6)
// Z: Log Market Cap (6.0 to 10.5 -> mapped to -8 to +8)
function assetToCoords(asset: RWAAsset): [number, number, number] {
  const turnover = asset.vol_mcap_ratio || 0.05;
  const x = Math.max(-8, Math.min(8, (turnover - 0.08) * 60));

  const risk = asset.risk_score || 50;
  const y = (risk - 50) / 7.5; // -6.6 to +6.6

  const logCap = Math.log10(Math.max(10_000, asset.market_cap || 1e8));
  const z = (logCap - 8.2) * 4.5; // normalized around ~500M

  return [x, y, z];
}

interface NodeProps {
  asset: RWAAsset;
  isSelected: boolean;
  onSelect: () => void;
  onHover: (asset: RWAAsset | null) => void;
}

const LatticeNode: React.FC<NodeProps> = ({ asset, isSelected, onSelect, onHover }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [coords] = useState<[number, number, number]>(() => assetToCoords(asset));

  // Determine color by risk band
  const colorHex =
    asset.risk_band === "CRITICAL"
      ? "#EF4444"
      : asset.risk_band === "ELEVATED"
      ? "#F59E0B"
      : "#10B981";

  // Scale node radius by market cap
  const baseRadius = 0.35 + Math.min(0.6, (asset.market_cap || 1e8) / 3e9);

  useFrame(() => {
    if (meshRef.current && isSelected) {
      meshRef.current.rotation.y += 0.02;
    }
  });

  return (
    <group position={coords}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(asset);
        }}
        onPointerOut={() => onHover(null)}
      >
        <octahedronGeometry args={[baseRadius, 0]} />
        <meshStandardMaterial
          color={colorHex}
          roughness={0.4}
          metalness={0.6}
          wireframe={isSelected}
        />
      </mesh>

      {/* Subtle Label */}
      <Html distanceFactor={16} position={[0, baseRadius + 0.3, 0]}>
        <div
          onClick={onSelect}
          className={`px-1.5 py-0.5 text-[9px] font-mono cursor-pointer transition-all border whitespace-nowrap select-none ${
            isSelected
              ? "bg-[#1C212E] text-[#E6EAF2] border-[#E6EAF2]"
              : "bg-[#08090C]/80 text-[#6B7280] border-[#1C212E] hover:text-[#E6EAF2]"
          }`}
        >
          {asset.symbol} ({asset.risk_score.toFixed(0)})
        </div>
      </Html>
    </group>
  );
};

// Wireframe coordinate planes
const CoordinatePlanes: React.FC = () => {
  return (
    <group>
      {/* Ground Grid (Turnover vs Log MCap) */}
      <gridHelper args={[20, 20, 0x242b3d, 0x1c212e]} position={[0, -7, 0]} />
      {/* Back Grid (Turnover vs Risk Score) */}
      <gridHelper
        args={[20, 20, 0x242b3d, 0x1c212e]}
        position={[0, 0, -10]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
};

export const RiskLatticeCanvas: React.FC<RiskLatticeCanvasProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [hoveredAsset, setHoveredAsset] = useState<RWAAsset | null>(null);

  const activeAsset =
    hoveredAsset || assets.find((a) => a.symbol === selectedSymbol) || assets[0];

  return (
    <div className="relative w-full h-full bg-[#08090C] overflow-hidden select-none">
      {/* Clinical HUD Readout Crosshair (Top-Left) */}
      <div className="absolute top-3 left-3 z-10 p-3 bg-[#0D1017]/90 border border-[#1C212E] rounded-[2px] font-mono text-[10px] w-64 pointer-events-none">
        <div className="flex items-center justify-between border-b border-[#1C212E] pb-1 mb-2 text-[#6B7280]">
          <span>3D RISK TOPOLOGY</span>
          <span className="text-[#E6EAF2] font-semibold">{activeAsset?.symbol || "NONE"}</span>
        </div>

        {activeAsset && (
          <div className="space-y-1.5 tabular-nums">
            <div className="flex justify-between">
              <span className="text-[#6B7280]">X (TURNOVER):</span>
              <span className="text-[#E6EAF2]">
                {activeAsset.vol_mcap_ratio.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Y (RISK SCORE):</span>
              <span
                style={{
                  color:
                    activeAsset.risk_band === "CRITICAL"
                      ? "#EF4444"
                      : activeAsset.risk_band === "ELEVATED"
                      ? "#F59E0B"
                      : "#10B981",
                }}
              >
                {activeAsset.risk_score.toFixed(1)} / 100 [{activeAsset.risk_band}]
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Z (LOG MCAP):</span>
              <span className="text-[#E6EAF2]">
                ${(activeAsset.market_cap / 1e6).toFixed(1)}M
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#1C212E]/60 text-[#6B7280]">
              <span>STATUS / PEG:</span>
              <span className="text-[#E6EAF2]">{activeAsset.peg_status || activeAsset.peg_state} ({activeAsset.peg_deviation_bps.toFixed(1)} bps)</span>
            </div>
          </div>
        )}
      </div>

      {/* Axis Guide HUD (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 z-10 p-2 bg-[#0D1017]/80 border border-[#1C212E] rounded-[2px] font-mono text-[9px] text-[#6B7280] space-y-0.5 pointer-events-none">
        <div>X-AXIS: LIQUIDITY TURNOVER (24H VOL / MCAP)</div>
        <div>Y-AXIS: INSTITUTIONAL RISK SCORE (0-100)</div>
        <div>Z-AXIS: LOGARITHMIC MARKET CAPITALIZATION</div>
        <div className="text-[#10B981] pt-0.5">● LOW RISK (&lt;35) &nbsp; <span className="text-[#F59E0B]">● ELEVATED (35-65)</span> &nbsp; <span className="text-[#EF4444]">● CRITICAL (&gt;65)</span></div>
      </div>

      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [14, 10, 18], fov: 42 }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 15, 10]} intensity={1.2} />
        <pointLight position={[-10, -5, -10]} intensity={0.5} />

        <CoordinatePlanes />

        {assets.map((asset) => (
          <LatticeNode
            key={asset.symbol}
            asset={asset}
            isSelected={asset.symbol === selectedSymbol}
            onSelect={() => onSelectSymbol(asset.symbol)}
            onHover={(a) => setHoveredAsset(a)}
          />
        ))}

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxDistance={35}
          minDistance={6}
        />
      </Canvas>
    </div>
  );
};
