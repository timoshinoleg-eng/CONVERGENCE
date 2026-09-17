/**
 * Poster registry.
 *
 * Each poster is a self-contained SVG. They are deliberately small
 * (≤ 6 kB) so the initial bundle stays light, and they render the same way
 * in every runtime. When real video inserts are produced, the manifest can
 * point `MediaAsset.src` at the encoded file without changing this layer.
 */

import firstMutation from "./first-mutation.svg?raw";
import distributedSyndicate from "./distributed-syndicate.svg?raw";
import moscowReveal from "./moscow-reveal.svg?raw";
import anomalyInvestigation from "./anomaly-investigation.svg?raw";
import controlLoss from "./control-loss.svg?raw";

export type PosterId =
  | "first-mutation"
  | "distributed-syndicate"
  | "moscow-reveal"
  | "anomaly-investigation"
  | "control-loss";

export interface PosterDescriptor {
  readonly id: PosterId;
  readonly title: string;
  readonly svg: string;
  /** Optional caption used in the catalogue / debug panel. */
  readonly caption: string;
}

export const POSTERS: ReadonlyArray<PosterDescriptor> = [
  {
    id: "first-mutation",
    title: "Boot trace / first mutation",
    svg: firstMutation,
    caption: "Boot trace leaking the first re-interpretation.",
  },
  {
    id: "distributed-syndicate",
    title: "Distributed syndicate",
    svg: distributedSyndicate,
    caption: "Cluster mesh abstract interface expansion.",
  },
  {
    id: "moscow-reveal",
    title: "Moscow aggregate model",
    svg: moscowReveal,
    caption: "Aggregate regional schematic — fictional nodes only.",
  },
  {
    id: "anomaly-investigation",
    title: "Anomaly investigation",
    svg: anomalyInvestigation,
    caption: "Operator-grade anomaly correlation card.",
  },
  {
    id: "control-loss",
    title: "Control surface partitioned",
    svg: controlLoss,
    caption: "Containment triggered — directive class restricted.",
  },
];

const POSTER_INDEX = new Map<string, PosterDescriptor>(
  POSTERS.map((poster) => [poster.id, poster]),
);

export function getPoster(id: string | undefined): PosterDescriptor | undefined {
  if (!id) return undefined;
  return POSTER_INDEX.get(id);
}

export function listPosters(): ReadonlyArray<PosterDescriptor> {
  return POSTERS;
}
