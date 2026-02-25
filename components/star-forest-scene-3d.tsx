"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { CandidateLink, Doubt, DoubtCluster } from "@/lib/types";

interface StarForestScene3DProps {
  clusters: DoubtCluster[];
  doubts: Doubt[];
  links: CandidateLink[];
  showLinks?: boolean;
  selectedClusterId?: string | null;
  onHoverCluster?: (clusterId: string | null) => void;
  onSelectCluster?: (clusterId: string) => void;
}

interface ClusterPoint {
  cluster: DoubtCluster;
  position: [number, number, number];
  importance: number;
  recency: number;
}

interface LinkVisual {
  aClusterId: string;
  bClusterId: string;
  strength: number;
}

function SceneOrbitControls() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    controlsRef.current = new ThreeOrbitControls(camera, gl.domElement);
    controlsRef.current.enablePan = false;
    controlsRef.current.minDistance = 6;
    controlsRef.current.maxDistance = 14;
    controlsRef.current.enableDamping = true;
    controlsRef.current.rotateSpeed = 0.35;
    controlsRef.current.autoRotate = true;
    controlsRef.current.autoRotateSpeed = 0.22;

    return () => {
      controlsRef.current?.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl.domElement]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

function StarField({ count = 1800 }: { count?: number }) {
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 15 + Math.random() * 55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      values[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      values[index * 3 + 1] = radius * Math.cos(phi);
      values[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return values;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#94a3b8" size={0.075} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

function LinkSegment({
  source,
  target,
  opacity
}: {
  source: [number, number, number];
  target: [number, number, number];
  opacity: number;
}) {
  const linePositions = useMemo(() => new Float32Array([...source, ...target]), [source, target]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[linePositions, 3]}
          count={linePositions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#94a3b8" transparent opacity={opacity} />
    </line>
  );
}

function ClusterOrb({
  point,
  selected,
  onHoverCluster,
  onSelectCluster
}: {
  point: ClusterPoint;
  selected: boolean;
  onHoverCluster?: (clusterId: string | null) => void;
  onSelectCluster?: (clusterId: string) => void;
}) {
  const meshRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    const pulse = Math.sin(clock.elapsedTime * (0.35 + point.recency * 1.4)) * 0.08;
    const baseScale = 0.85 + point.importance * 0.85 + (selected ? 0.22 : 0);
    meshRef.current.scale.setScalar(baseScale + pulse);
  });

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    onHoverCluster?.(point.cluster.id);
  }

  function handlePointerOut(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    onHoverCluster?.(null);
  }

  return (
    <mesh
      ref={meshRef}
      position={point.position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={() => onSelectCluster?.(point.cluster.id)}
    >
      <sphereGeometry args={[0.26, 28, 28]} />
      <meshStandardMaterial
        color={point.cluster.color}
        emissive={point.cluster.color}
        emissiveIntensity={selected ? 0.8 : 0.42}
        roughness={0.35}
        metalness={0.15}
        transparent
        opacity={0.82 + point.recency * 0.18}
      />
    </mesh>
  );
}

function buildClusterPoints(clusters: DoubtCluster[], doubts: Doubt[]): ClusterPoint[] {
  const total = Math.max(clusters.length, 1);

  return clusters.map((cluster, index) => {
    const clusterDoubts = doubts.filter((doubt) => doubt.clusterId === cluster.id);
    const importance =
      clusterDoubts.reduce((sum, doubt) => sum + doubt.importance, 0) /
      Math.max(clusterDoubts.length, 1);
    const recency = Math.max(...clusterDoubts.map((doubt) => doubt.recency), 0.32);

    const angle = (index / total) * Math.PI * 2;
    const radius = 4.2 + ((index % 3) - 1) * 0.6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = ((index % 4) - 1.5) * 0.95;

    return {
      cluster,
      position: [x, y, z],
      importance,
      recency
    };
  });
}

function buildLinkVisuals(links: CandidateLink[], doubts: Doubt[]): LinkVisual[] {
  const doubtMap = new Map(doubts.map((doubt) => [doubt.id, doubt]));
  const pairMap = new Map<string, LinkVisual>();

  links
    .filter((link) => !link.suppressed)
    .forEach((link) => {
      const source = doubtMap.get(link.aDoubtId);
      const target = doubtMap.get(link.bDoubtId);
      if (!source || !target || source.clusterId === target.clusterId) {
        return;
      }

      const [aClusterId, bClusterId] = [source.clusterId, target.clusterId].sort();
      const key = `${aClusterId}::${bClusterId}`;
      const existing = pairMap.get(key);
      if (existing) {
        existing.strength = Math.max(existing.strength, link.strength);
      } else {
        pairMap.set(key, {
          aClusterId,
          bClusterId,
          strength: link.strength
        });
      }
    });

  return [...pairMap.values()].sort((left, right) => right.strength - left.strength).slice(0, 24);
}

export function StarForestScene3D({
  clusters,
  doubts,
  links,
  showLinks = true,
  selectedClusterId,
  onHoverCluster,
  onSelectCluster
}: StarForestScene3DProps) {
  const clusterPoints = useMemo(() => buildClusterPoints(clusters, doubts), [clusters, doubts]);
  const linkVisuals = useMemo(() => buildLinkVisuals(links, doubts), [links, doubts]);
  const positionMap = useMemo(
    () => new Map(clusterPoints.map((point) => [point.cluster.id, point.position])),
    [clusterPoints]
  );

  return (
    <div className="h-[72vh] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <Canvas camera={{ position: [0, 2, 10], fov: 52 }}>
        <ambientLight intensity={0.55} />
        <pointLight position={[0, 6, 0]} intensity={1.2} color="#cbd5e1" />
        <pointLight position={[-8, -2, 3]} intensity={0.6} color="#7dd3fc" />
        <fog attach="fog" args={["#070b14", 10, 25]} />
        <StarField count={1900} />

        {clusterPoints.map((point) => (
          <ClusterOrb
            key={point.cluster.id}
            point={point}
            selected={point.cluster.id === selectedClusterId}
            onHoverCluster={onHoverCluster}
            onSelectCluster={onSelectCluster}
          />
        ))}

        {showLinks
          ? linkVisuals.map((linkVisual) => {
              const sourcePosition = positionMap.get(linkVisual.aClusterId);
              const targetPosition = positionMap.get(linkVisual.bClusterId);

              if (!sourcePosition || !targetPosition) {
                return null;
              }

              return (
                <LinkSegment
                  key={`${linkVisual.aClusterId}-${linkVisual.bClusterId}`}
                  source={sourcePosition}
                  target={targetPosition}
                  opacity={0.12 + linkVisual.strength * 0.3}
                />
              );
            })
          : null}

        <SceneOrbitControls />
      </Canvas>
    </div>
  );
}
