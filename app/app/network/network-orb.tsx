"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { drag, type D3DragEvent } from "d3-drag";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { btnSecondarySmall } from "@/app/components/ui/styles";
import { initials } from "@/app/components/avatar-color";

export type OrbNodeInput = {
  id: string;
  label: string;
  color: string;
  isMe: boolean;
  avatarUrl: string | null;
  // In the community view: someone the viewer is directly connected to.
  // Drawn slightly larger and always labelled.
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

type OrbNode = SimulationNodeDatum & OrbNodeInput & { r: number; showLabel: boolean };
type OrbLink = SimulationLinkDatum<OrbNode> & Omit<OrbLinkInput, "source" | "target">;

// 5-tier strength -> line weight/opacity. Strength itself is never
// rendered as a number or a label -- only this private, per-user visual
// weighting.
const STRENGTH_WIDTH: Record<number, number> = { 1: 1.5, 2: 2, 3: 2.5, 4: 3, 5: 3.5 };
const STRENGTH_OPACITY: Record<number, number> = { 1: 0.4, 2: 0.55, 3: 0.7, 4: 0.85, 5: 1 };

const SIZES = {
  mine: { width: 340, height: 420 },
  community: { width: 720, height: 560 },
} as const;

// Above this many nodes, only "you" and your direct connections get a
// permanent name label; everyone else is labelled on hover. Keeps a big
// community graph readable instead of a wall of overlapping text.
const LABEL_ALL_THRESHOLD = 40;

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
  const router = useRouter();
  const { width: WIDTH, height: HEIGHT } = SIZES[mode];
  const isCommunity = mode === "community";

  useEffect(() => {
    if (!svgRef.current) return;

    const labelAll = nodeInputs.length <= LABEL_ALL_THRESHOLD;
    const nodes: OrbNode[] = nodeInputs.map((n) => {
      const r = n.isMe ? 20 : isCommunity ? (n.isMine ? 12 : 9) : 14;
      return { ...n, r, showLabel: n.isMe || !!n.isMine || labelAll };
    });
    const links: OrbLink[] = linkInputs.map((l) => ({ ...l }));

    const neighbors = new Map<string, Set<string>>();
    for (const l of linkInputs) {
      if (!neighbors.has(l.source)) neighbors.set(l.source, new Set());
      if (!neighbors.has(l.target)) neighbors.set(l.target, new Set());
      neighbors.get(l.source)!.add(l.target);
      neighbors.get(l.target)!.add(l.source);
    }

    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const root = svg.append("g");

    const linkSel = root
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => d.color)
      .attr("stroke-opacity", (d) =>
        d.strength ? (STRENGTH_OPACITY[d.strength] ?? 1) : isCommunity ? 0.7 : 0.8,
      )
      .attr("stroke-width", (d) =>
        d.strength ? (STRENGTH_WIDTH[d.strength] ?? 1.5) : isCommunity ? 1.75 : 2,
      )
      .attr("stroke-dasharray", (d) => (d.isFormer ? "4,3" : null));

    // A class, not .style() -- the app's CSP (style-src with a nonce, no
    // unsafe-inline) blocks CSSOM style mutation the same way it blocks
    // an inline style="" attribute, so d3's .style() would silently
    // no-op here just like it did on the admin metrics charts.
    const nodeGroup = root
      .append("g")
      .selectAll<SVGGElement, OrbNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (d) => (d.isMe ? "cursor-grab" : "cursor-pointer"));

    const defs = root.append("defs");
    defs
      .selectAll("clipPath")
      .data(nodes.filter((d) => d.avatarUrl))
      .join("clipPath")
      .attr("id", (d) => `orb-clip-${d.id}`)
      .append("circle")
      .attr("r", (d) => d.r);

    nodeGroup
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => d.color)
      .attr("stroke", (d) => (isCommunity && d.isMine ? "var(--accent)" : "var(--surface)"))
      .attr("stroke-width", 2);

    nodeGroup
      .filter((d) => !!d.avatarUrl)
      .append("image")
      .attr("href", (d) => d.avatarUrl!)
      .attr("x", (d) => -d.r)
      .attr("y", (d) => -d.r)
      .attr("width", (d) => d.r * 2)
      .attr("height", (d) => d.r * 2)
      .attr("clip-path", (d) => `url(#orb-clip-${d.id})`)
      .attr("preserveAspectRatio", "xMidYMid slice");

    nodeGroup
      .filter((d) => !d.avatarUrl && d.r >= 12)
      .append("text")
      .text((d) => (d.isMe ? "You" : initials(d.label) || "?"))
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", (d) => (d.isMe ? 12 : 10))
      .attr("font-family", "var(--font-label)")
      .attr("font-weight", 600)
      // "You" sits on the accent fill, which turns light in dark mode.
      .attr("fill", (d) => (d.isMe ? "var(--on-accent)" : "#FFFFFF"))
      .attr("pointer-events", "none");

    const labelSel = nodeGroup
      .filter((d) => !d.isMe || !!d.avatarUrl)
      .append("text")
      .text((d) => (d.isMe ? "You" : d.label.split(" ")[0]))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 13)
      .attr("font-size", 11)
      .attr("font-family", "var(--font-label)")
      .attr("fill", "var(--ink)")
      // A halo in the canvas color so names stay legible where they
      // cross lines.
      .attr("stroke", "var(--fill)")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .attr("pointer-events", "none")
      .attr("opacity", (d) => (d.showLabel ? 1 : 0));

    nodeGroup.append("title").text((d) => (d.isMe ? "You" : d.label));

    const n = nodes.length;
    const simulation = forceSimulation<OrbNode>(nodes)
      .force(
        "link",
        forceLink<OrbNode, OrbLink>(links)
          .id((d) => d.id)
          .distance(isCommunity ? 55 : 90),
      )
      .force("charge", forceManyBody().strength(isCommunity ? (n > 150 ? -40 : -90) : -160))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide<OrbNode>((d) => d.r + (isCommunity ? 6 : 16)));

    if (isCommunity) {
      // Separate clusters (two public people who aren't linked to the
      // rest) would otherwise drift off-screen; a gentle pull keeps
      // everything inside the frame.
      simulation.force("x", forceX(WIDTH / 2).strength(0.05)).force("y", forceY(HEIGHT / 2).strength(0.05));
      // Settle the layout up front so a big graph doesn't spend seconds
      // visibly jiggling into place.
      simulation.stop();
      simulation.tick(300);
    }

    function render() {
      linkSel
        .attr("x1", (d) => (d.source as OrbNode).x ?? 0)
        .attr("y1", (d) => (d.source as OrbNode).y ?? 0)
        .attr("x2", (d) => (d.target as OrbNode).x ?? 0)
        .attr("y2", (d) => (d.target as OrbNode).y ?? 0);
      nodeGroup.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }
    render();
    simulation.on("tick", render);

    // Hover/focus: highlight a person and their direct connections, dim
    // everyone else, and reveal their name.
    function highlight(focus: OrbNode | null) {
      if (!focus) {
        nodeGroup.attr("opacity", 1);
        linkSel.attr("opacity", 1);
        labelSel.attr("opacity", (d) => (d.showLabel ? 1 : 0));
        return;
      }
      const near = neighbors.get(focus.id) ?? new Set<string>();
      const isNear = (id: string) => id === focus.id || near.has(id);
      nodeGroup.attr("opacity", (d) => (isNear(d.id) ? 1 : 0.15));
      linkSel.attr("opacity", (d) =>
        (d.source as OrbNode).id === focus.id || (d.target as OrbNode).id === focus.id ? 1 : 0.06,
      );
      labelSel.attr("opacity", (d) => (isNear(d.id) ? 1 : 0));
    }
    nodeGroup.on("mouseenter", (_e, d) => highlight(d)).on("mouseleave", () => highlight(null));

    nodeGroup.on("click", (event: MouseEvent, d) => {
      if (event.defaultPrevented || d.isMe) return;
      router.push(`/app/u/${d.id}`);
    });

    const dragBehavior = drag<SVGGElement, OrbNode>()
      .on("start", (event: D3DragEvent<SVGGElement, OrbNode, OrbNode>, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
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
      });

    nodeGroup.call(dragBehavior);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        root.attr("transform", event.transform.toString());
      });

    svg.call(zoomBehavior);

    // Fit the settled community layout into view.
    let initial = zoomIdentity;
    if (isCommunity && nodes.length > 1) {
      const xs = nodes.map((d) => d.x ?? 0);
      const ys = nodes.map((d) => d.y ?? 0);
      const pad = 40;
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad;
      const maxY = Math.max(...ys) + pad;
      const k = Math.min(1.5, WIDTH / (maxX - minX), HEIGHT / (maxY - minY));
      initial = zoomIdentity
        .translate(WIDTH / 2, HEIGHT / 2)
        .scale(k)
        .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    }
    svg.call(zoomBehavior.transform, initial);

    return () => {
      simulation.stop();
    };
  }, [nodeInputs, linkInputs, isCommunity, WIDTH, HEIGHT, router]);

  function handleExport() {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(WIDTH));
    svgClone.setAttribute("height", String(HEIGHT));

    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", "#FFFFFF");
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = isCommunity ? "community-network.png" : "my-network.png";
        link.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={
          isCommunity
            ? "Everyone's public connections, visualized as a graph"
            : "Your network, visualized as a graph"
        }
        className="h-auto w-full touch-none rounded-card border border-border bg-fill"
      />
      <p className="text-center text-xs text-muted">
        {isCommunity
          ? "Hover to highlight someone's connections, tap a person to open their profile. Drag to rearrange, pinch or scroll to zoom. Dashed lines mean a former relationship."
          : "Drag people to rearrange, tap to open a profile, pinch or scroll to zoom. Dashed lines mean a former relationship."}
      </p>
      <button type="button" onClick={handleExport} className={btnSecondarySmall}>
        Export as image
      </button>
    </div>
  );
}
