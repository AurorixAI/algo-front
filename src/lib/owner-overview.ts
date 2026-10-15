/**
 * Owner dashboard numbers. Pure: no React and no network, so node:test can load this file.
 */
import { isAtRisk } from "./diagnostic-level";

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

/** A group row of the dashboard; `group_id` tells two groups apart. */
export interface DashboardGroup extends GroupThetaSummary {
  group_id: string;
  name: string;
}

export interface DashboardGroupLists<T> {
  /** Best groups, best first (at most three). */
  leaders: T[];
  /** Weakest groups, weakest first (at most three). Never contains a leader. */
  risk: T[];
  /** Groups that have a θ at all. */
  withData: number;
  /** False while fewer than two groups have a θ: there is nothing to compare, so no leaders are named. */
  comparable: boolean;
}

/**
 * «Лидеры успеваемости» and «Зоны риска» of the owner dashboard - one group never stands in both.
 *
 * Rule (one for the whole dashboard):
 *  - only groups with a θ take part;
 *  - leaders = groups with θ strictly above the centre average, best three, and only groups that are
 *    not in the risk zone themselves (a group below grade is never called a leader);
 *  - risk = groups with θ below −0.5 (the level policy's «below grade»), weakest three, without leaders;
 *  - fewer than two groups with θ: no comparison, so no leaders («Мало данных для сравнения»); an
 *    absolute risk (θ below −0.5) can still be named.
 * `centre` is the centre's θ (the server's student-weighted value); without one the plain average of
 * the groups' θ is used.
 */
export function splitDashboardGroups<T extends DashboardGroup>(groups: T[], centre: number | null | undefined): DashboardGroupLists<T> {
  const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
  const withTheta = groups.filter((g) => finite(g.avg_theta));
  const comparable = withTheta.length >= 2;
  const average = finite(centre)
    ? centre
    : withTheta.length > 0
      ? withTheta.reduce((sum, g) => sum + (g.avg_theta as number), 0) / withTheta.length
      : null;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "ru");
  const best = [...withTheta].sort((a, b) => (b.avg_theta as number) - (a.avg_theta as number) || byName(a, b));
  const worst = [...withTheta].sort((a, b) => (a.avg_theta as number) - (b.avg_theta as number) || byName(a, b));

  // The level policy's «below grade» (θ below −0.5) - the same test as everywhere else.
  const atRisk = (g: T) => isAtRisk({ theta: g.avg_theta });
  const leaders = comparable && average !== null
    ? best.filter((g) => (g.avg_theta as number) > average && !atRisk(g)).slice(0, 3)
    : [];
  const leaderIds = new Set(leaders.map((g) => g.group_id));
  const risk = worst.filter((g) => atRisk(g) && !leaderIds.has(g.group_id)).slice(0, 3);
  return { leaders, risk, withData: withTheta.length, comparable };
}
