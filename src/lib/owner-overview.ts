/**
 * Owner dashboard numbers. Pure: no React and no network, so node:test can load this file.
 */

export interface GroupThetaSummary {
  avg_theta: number | null;
  /** Students of the group with a diagnostic result; absent on an older server (counted as one). */
  diagnosed_count?: number | null;
}

/**
 * θ of the whole centre for the dashboard: the server's `avg_theta` (each diagnosed student once,
 * even in two groups) when it sends one, else the weighted group averages of an older server.
 */
export function centreTheta(overview: {
  groups: GroupThetaSummary[];
  avg_theta?: number | null;
} | null | undefined): number | null {
  if (!overview) return null;
  if (overview.avg_theta !== undefined) {
    return typeof overview.avg_theta === "number" && Number.isFinite(overview.avg_theta) ? overview.avg_theta : null;
  }
  return weightedAverageTheta(overview.groups ?? []);
}

/**
 * Average θ of the whole centre: the groups' averages weighted by how many students stand behind
 * each, so a group of two does not weigh as much as a group of twenty. `null` when no group has
 * a θ - the dashboard then shows «—» instead of a made-up 0.00.
 */
export function weightedAverageTheta(groups: GroupThetaSummary[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const group of groups) {
    if (group.avg_theta === null || group.avg_theta === undefined || !Number.isFinite(group.avg_theta)) continue;
    const count = group.diagnosed_count;
    const w = typeof count === "number" && Number.isFinite(count) && count > 0 ? count : 1;
    sum += group.avg_theta * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}
