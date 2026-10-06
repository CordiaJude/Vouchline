import { REL_TYPES } from "@/app/components/rel-types";
import type { OrbNodeInput, OrbLinkInput } from "@/app/app/network/network-orb";

// Shared by the network page's orb and Explore's Map: shapes the flat
// edge list from public_graph() (0030_connection_visibility.sql) into
// orb nodes and links.

export type PublicGraphEdge = {
  src_id: string;
  src_name: string;
  src_avatar_url: string | null;
  dst_id: string;
  dst_name: string;
  dst_avatar_url: string | null;
  shared_type: string | null;
  is_former: boolean;
  involves_me: boolean;
};

export const REL_COLORS: Record<string, string> = Object.fromEntries(
  REL_TYPES.map((r) => [r.value, r.color]),
);
export const NEUTRAL_COLOR = "#737373";
export const ME_COLOR = "var(--accent)";
export const relColor = (t: string | null) => (t ? REL_COLORS[t] ?? NEUTRAL_COLOR : NEUTRAL_COLOR);

// Turns the flat edge list from public_graph() into orb nodes/links.
// Nodes are neutral in this view (a person has many relationship types
// here, not one); the line color carries the type. "You" and your direct
// connections are emphasized so you can find yourself in the crowd.
export function buildCommunityGraph(
  edges: PublicGraphEdge[],
  myId: string,
): { nodes: OrbNodeInput[]; links: OrbLinkInput[] } {
  const mine = new Set<string>();
  for (const e of edges) {
    if (e.src_id === myId) mine.add(e.dst_id);
    if (e.dst_id === myId) mine.add(e.src_id);
  }
  const nodes = new Map<string, OrbNodeInput>();
  const addNode = (id: string, name: string, avatarUrl: string | null) => {
    if (nodes.has(id)) return;
    const isMe = id === myId;
    nodes.set(id, {
      id,
      label: name,
      avatarUrl,
      isMe,
      isMine: mine.has(id),
      color: isMe ? ME_COLOR : mine.has(id) ? "#4CB5F9" : NEUTRAL_COLOR,
    });
  };
  for (const e of edges) {
    addNode(e.src_id, e.src_name, e.src_avatar_url);
    addNode(e.dst_id, e.dst_name, e.dst_avatar_url);
  }
  return {
    nodes: [...nodes.values()],
    links: edges.map((e) => ({
      source: e.src_id,
      target: e.dst_id,
      color: relColor(e.shared_type),
      isFormer: e.is_former,
    })),
  };
}
