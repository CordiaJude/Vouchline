"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceRadial,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { drag, type D3DragEvent } from "d3-drag";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom";
import { avatarHex, initials } from "@/app/components/avatar-color";
import { Icon } from "@/app/components/icons";

// The network "orb": a solar-system layout. You sit at the center with a
// soft glow; people you're directly connected to orbit on the first ring
// (Instagram-style gradient ring around their photo); their connections
// sit on the next ring out, and so on. Lines curve and carry the
// relationship-type color. Tap a person to see who they are.

export type OrbNodeInput = {
  id: string;
  label: string;
  color: string;
  isMe: boolean;
  avatarUrl: string | null;
  // In the community view: someone the viewer is directly connected to.
  isMine?: boolean;
};

export type OrbLinkInput = {
  source: string;
  target: string;
  color: string;
  isFormer: boolean;
  // The viewer's own private closeness rating -- only ever set in the
  // "mine" view for the viewer's own edges. Never present in the
  // community view, which has no strength data at all.
  strength?: number;
};

type OrbNode = SimulationNodeDatum &
  OrbNodeInput & { r: number; hop: number; degree: number; showLabel: boolean };
type OrbLink = SimulationLinkDatum<OrbNode> & Omit<OrbLinkInput, "source" | "target"> & { direct: boolean };

const W = 800;
const H = 800;
const CX = W / 2;
const CY = H / 2;
// Orbit radius per hop from "you" (index = hop).
const RING = [0, 150, 260, 340, 390, 420, 440];
// Above this many people, only you + your direct connections are always
// named; everyone else is named on hover/tap.
const LABEL_ALL_THRESHOLD = 30;

type Selected = { id: string; label: string; isMe: boolean; degree: number; hop: number } | null;

export function NetworkOrb({
  mode,
  nodes: nodeInputs,
  links: linkInputs,
}: {
  mode: "mine" | "community";
  nodes: OrbNodeInput[];
  links: OrbLinkInput[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<{ behavior: ZoomBehavior<SVGSVGElement, unknown>; fit: () => void } | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Phone-width frames scale people and names up so they stay readable
  // (the drawing is 800 units wide, so ~360px would shrink text ~55%).
  const [compact, setCompact] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    // ----- graph prep: hops from "you" (BFS) and degree -----
    const meId = nodeInputs.find((n) => n.isMe)?.id;
    const adj = new Map<string, string[]>();
    for (const l of linkInputs) {
      (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
      (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
    }
    const hop = new Map<string, number>();
    if (meId) {
      hop.set(meId, 0);
      const queue = [meId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
          if (!hop.has(nb)) {
            hop.set(nb, hop.get(cur)! + 1);
            queue.push(nb);
          }
        }
      }
    }
    const maxHop = Math.max(1, ...hop.values());
    // UI scale: people, names and spacing grow on phones; rings spread a
    // little so the bigger dots still fit.
    const ui = compact ? 1.9 : 1;
    const ring = (h: number) => RING[Math.min(h, RING.length - 1)] * (compact ? 1.2 : 1);
    const labelAll = nodeInputs.length <= LABEL_ALL_THRESHOLD;

    const nodes: OrbNode[] = nodeInputs.map((n) => {
      const h = hop.get(n.id) ?? maxHop + 1;
      const degree = adj.get(n.id)?.length ?? 0;
      const r = (n.isMe ? 30 : h === 1 ? 17 : Math.min(14, 8 + degree)) * ui;
      return { ...n, hop: h, degree, r, showLabel: n.isMe || h === 1 || labelAll };
    });
    const links: OrbLink[] = linkInputs.map((l) => ({
      ...l,
      direct: l.source === meId || l.target === meId,
    }));

    // ----- svg scaffold -----
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    const defs = svg.append("defs");

    // Instagram-style gradient for rings.
    const ig = defs
      .append("linearGradient")
      .attr("id", "orb-ig")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "100%")
      .attr("y2", "0%");
    // Colors come from the chosen color scheme (.g-stop-N in globals.css).
    [
      ["0%", "g-stop-1"],
      ["50%", "g-stop-2"],
      ["100%", "g-stop-3"],
    ].forEach(([o, c]) => ig.append("stop").attr("offset", o).attr("class", c));

    // Halo behind "you".
    const halo = defs.append("radialGradient").attr("id", "orb-halo");
    halo.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff").attr("stop-opacity", 0.22);
    halo.append("stop").attr("offset", "45%").attr("class", "g-stop-2").attr("stop-opacity", 0.12);
    halo.append("stop").attr("offset", "100%").attr("stop-color", "#000000").attr("stop-opacity", 0);

    // Soft glow for direct connections' lines.
    const glow = defs.append("filter").attr("id", "orb-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glow.append("feGaussianBlur").attr("stdDeviation", 3).attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const root = svg.append("g");

    // Orbit rings.
    const rings = root.append("g").attr("pointer-events", "none");
    for (let h = 1; h <= Math.min(maxHop, RING.length - 1); h++) {
      rings
        .append("circle")
        .attr("cx", CX)
        .attr("cy", CY)
        .attr("r", ring(h))
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-opacity", h === 1 ? 0.08 : 0.05)
        .attr("stroke-dasharray", h === 1 ? null : "2 6");
    }
    rings.append("circle").attr("cx", CX).attr("cy", CY).attr("r", 120 * ui).attr("fill", "url(#orb-halo)");

    // ----- layout: settle up front (no jiggle, reduced-motion friendly) -----
    for (const n of nodes) {
      if (n.isMe) {
        n.fx = CX;
        n.fy = CY;
      }
    }
    const simulation = forceSimulation<OrbNode>(nodes)
      .force(
        "link",
        forceLink<OrbNode, OrbLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.direct ? ring(1) : 90 * ui))
          .strength((l) => (l.direct ? 0.15 : 0.08)),
      )
      .force("charge", forceManyBody<OrbNode>().strength((d) => (d.hop <= 1 ? -220 : -60)))
      .force(
        "radial",
        forceRadial<OrbNode>((d) => ring(d.hop), CX, CY).strength(0.9),
      )
      .force("collide", forceCollide<OrbNode>((d) => d.r + (d.showLabel ? 18 : 6) * ui))
      .stop();
    simulation.tick(320);

    // ----- edges: gentle curves -----
    const curve = (l: OrbLink) => {
      const s = l.source as OrbNode;
      const t = l.target as OrbNode;
      const sx = s.x ?? 0,
        sy = s.y ?? 0,
        tx = t.x ?? 0,
        ty = t.y ?? 0;
      const mx = (sx + tx) / 2,
        my = (sy + ty) / 2;
      // Bow each curve away from the center so lines don't pile through "you".
      const dx = mx - CX,
        dy = my - CY;
      const len = Math.hypot(dx, dy) || 1;
      const bow = l.direct ? 0 : 18;
      return `M${sx},${sy} Q${mx + (dx / len) * bow},${my + (dy / len) * bow} ${tx},${ty}`;
    };

    const linkSel = root
      .append("g")
      .attr("fill", "none")
      .selectAll<SVGPathElement, OrbLink>("path")
      .data(links)
      .join("path")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", (d) => (d.strength ? 1 + d.strength * 0.5 : d.direct ? 2 : 1.25) * ui)
      .attr("stroke-opacity", (d) => (d.direct ? 0.85 : 0.4))
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (d) => (d.isFormer ? "5 5" : null))
      .attr("filter", (d) => (d.direct ? "url(#orb-glow)" : null));

    // ----- people -----
    // A class, not .style() -- the app's CSP blocks CSSOM style mutation.
    const nodeSel = root
      .append("g")
      .selectAll<SVGGElement, OrbNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", "cursor-pointer")
      .attr("role", "button")
      .attr("aria-label", (d) => (d.isMe ? "You" : d.label));

    // Ring: white for you, Instagram gradient for direct, hairline otherwise.
    nodeSel
      .append("circle")
      .attr("r", (d) => d.r + (d.isMe ? 4 : d.hop === 1 ? 3 : 1.5) * ui)
      .attr("fill", (d) => (d.isMe ? "#ffffff" : d.hop === 1 ? "url(#orb-ig)" : "#3a3a3a"));
    nodeSel
      .append("circle")
      .attr("r", (d) => d.r + (d.isMe ? 1.5 : d.hop === 1 ? 1 : 0) * ui)
      .attr("fill", "#000");

    nodeSel
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => (d.isMe ? "#f5f5f5" : avatarHex(d.id)));

    defs
      .selectAll("clipPath")
      .data(nodes.filter((d) => d.avatarUrl))
      .join("clipPath")
      .attr("id", (d) => `orb-clip-${d.id}`)
      .append("circle")
      .attr("r", (d) => d.r);
    nodeSel
      .filter((d) => !!d.avatarUrl)
      .append("image")
      .attr("href", (d) => d.avatarUrl!)
      .attr("x", (d) => -d.r)
      .attr("y", (d) => -d.r)
      .attr("width", (d) => d.r * 2)
      .attr("height", (d) => d.r * 2)
      .attr("clip-path", (d) => `url(#orb-clip-${d.id})`)
      .attr("preserveAspectRatio", "xMidYMid slice");

    nodeSel
      .filter((d) => !d.avatarUrl && d.r >= 12 * ui)
      .append("text")
      .text((d) => (d.isMe ? "You" : initials(d.label) || "?"))
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", (d) => (d.isMe ? 15 : 11) * ui)
      .attr("font-weight", 700)
      .attr("font-family", "var(--font-display)")
      .attr("fill", (d) => (d.isMe ? "#000" : "#e0e0e0"))
      .attr("pointer-events", "none");

    const labelSel = nodeSel
      .filter((d) => !d.isMe)
      .append("text")
      .text((d) => d.label.split(" ")[0])
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 16 * ui)
      .attr("font-size", 12 * ui)
      .attr("font-weight", 600)
      .attr("font-family", "var(--font-display)")
      .attr("fill", "#f5f5f5")
      .attr("stroke", "#000")
      .attr("stroke-width", 4 * ui)
      .attr("paint-order", "stroke")
      .attr("pointer-events", "none")
      .attr("opacity", (d) => (d.showLabel ? 1 : 0));

    function render() {
      linkSel.attr("d", curve);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }
    render();
    simulation.on("tick", render);

    // ----- focus: highlight a person and their connections -----
    function focus(id: string | null) {
      if (!id) {
        nodeSel.attr("opacity", 1);
        linkSel.attr("opacity", 1);
        labelSel.attr("opacity", (d) => (d.showLabel ? 1 : 0));
        return;
      }
      const near = new Set([id, ...(adj.get(id) ?? [])]);
      nodeSel.attr("opacity", (d) => (near.has(d.id) ? 1 : 0.18));
      linkSel.attr("opacity", (d) =>
        (d.source as OrbNode).id === id || (d.target as OrbNode).id === id ? 1 : 0.05,
      );
      labelSel.attr("opacity", (d) => (near.has(d.id) ? 1 : 0));
    }
    let pinned: string | null = null;
    nodeSel
      .on("mouseenter", (_e, d) => {
        if (!pinned) focus(d.id);
      })
      .on("mouseleave", () => {
        if (!pinned) focus(null);
      })
      .on("click", (event: MouseEvent, d) => {
        if (event.defaultPrevented) return; // was a drag
        event.stopPropagation();
        pinned = d.id;
        focus(d.id);
        setSelected({ id: d.id, label: d.label, isMe: d.isMe, degree: d.degree, hop: d.hop });
      });
    svg.on("click", () => {
      pinned = null;
      focus(null);
      setSelected(null);
    });

    // ----- drag (you stay pinned at the center) -----
    nodeSel.filter((d) => !d.isMe).call(
      drag<SVGGElement, OrbNode>()
        .on("start", (event: D3DragEvent<SVGGElement, OrbNode, OrbNode>, d) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event: D3DragEvent<SVGGElement, OrbNode, OrbNode>, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event: D3DragEvent<SVGGElement, OrbNode, OrbNode>, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    // ----- zoom + fit -----
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        root.attr("transform", event.transform.toString());
      });
    svg.call(behavior);
    // Fit everyone in view, centered on "you" (the middle of the orb),
    // not on the bounding box -- so you're always dead center.
    const fit = () => {
      const pad = 40 * ui;
      let reach = 0;
      for (const n of nodes) {
        const d = Math.hypot((n.x ?? CX) - CX, (n.y ?? CY) - CY) + n.r + (n.showLabel ? 22 * ui : 0);
        reach = Math.max(reach, d);
      }
      const k = Math.min(1.6, Math.min(W, H) / 2 / (reach + pad));
      svg.call(behavior.transform, zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-CX, -CY));
    };
    fit();
    zoomRef.current = { behavior, fit };

    // Esc clears a selection.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinned = null;
        focus(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      simulation.stop();
      window.removeEventListener("keydown", onKey);
    };
  }, [nodeInputs, linkInputs, compact]);

  // Re-fit when entering/leaving full screen (the frame changes size).
  useEffect(() => {
    zoomRef.current?.fit();
  }, [fullscreen]);

  function handleExport() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#000000");
    clone.insertBefore(bg, clone.firstChild);
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }),
    );
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = mode === "community" ? "vouchline-network.png" : "my-network.png";
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  const ringLabel = (hop: number) =>
    hop === 1 ? "Your connection" : hop === 2 ? "Friend of a friend" : `${hop} steps away`;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-black"
          : "relative mt-4 overflow-hidden rounded-card border border-border"
      }
    >
      <div ref={frameRef} className={`bg-orb relative ${fullscreen ? "flex-1" : "aspect-square md:aspect-[4/3]"}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full touch-none select-none"
          role="img"
          aria-label={mode === "community" ? "Your extended network map" : "Your network map"}
        />

        {/* Controls */}
        <div className="absolute right-2 top-2 flex flex-col gap-1.5 md:right-3 md:top-3 md:gap-2">
          <OrbButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => setFullscreen((f) => !f)}>
            <Icon name={fullscreen ? "close" : "expand"} className="h-[18px] w-[18px]" />
          </OrbButton>
          <OrbButton label="Recenter" onClick={() => zoomRef.current?.fit()}>
            <Icon name="target" className="h-[18px] w-[18px]" />
          </OrbButton>
          <OrbButton label="Save as image" onClick={handleExport}>
            <Icon name="download" className="h-[18px] w-[18px]" />
          </OrbButton>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 hidden flex-col gap-1.5 rounded-input bg-black/60 px-3 py-2 text-[11px] font-semibold text-muted backdrop-blur md:flex">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white" /> You
          </span>
          <span className="flex items-center gap-2">
            <span className="ring-brand-gradient h-2.5 w-2.5" /> Your connections
          </span>
          {mode === "community" && (
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border border-[#5e5e5e]" /> Their connections
            </span>
          )}
        </div>

        {/* Selected person */}
        {selected && !selected.isMe && (
          <div className="absolute inset-x-3 bottom-3 ml-auto flex max-w-sm items-center gap-3 rounded-card border border-border bg-surface/95 p-3 backdrop-blur md:left-auto">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{selected.label}</p>
              <p className="text-xs text-muted">
                {ringLabel(selected.hop)} · {selected.degree} {selected.degree === 1 ? "connection" : "connections"} here
              </p>
            </div>
            <Link
              href={`/app/u/${selected.id}`}
              className="inline-flex h-9 shrink-0 items-center rounded-pill bg-accent px-4 text-xs font-semibold text-on-accent"
            >
              View profile
            </Link>
          </div>
        )}
      </div>
      {!fullscreen && (
        <p className="border-t border-border bg-surface px-4 py-2.5 text-center text-xs text-muted">
          <span className="mb-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-semibold md:hidden">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white" /> You
            </span>
            <span className="flex items-center gap-1.5">
              <span className="ring-brand-gradient h-2 w-2" /> Connections
            </span>
            {mode === "community" && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-[#5e5e5e]" /> Theirs
              </span>
            )}
          </span>
          Tap a person to see who they are · pinch to zoom
        </p>
      )}
    </div>
  );
}

function OrbButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 md:h-9 md:w-9"
    >
      {children}
    </button>
  );
}
