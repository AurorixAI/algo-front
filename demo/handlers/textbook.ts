import type { DemoRequest, DemoResponse } from "../types";
import class5Books from "../fixtures/textbooks/class5.json";
import class6Books from "../fixtures/textbooks/class6.json";
import class7Books from "../fixtures/textbooks/class7.json";
import class8Books from "../fixtures/textbooks/class8.json";
import class5Skills from "../fixtures/skills/class5.json";
import class6Skills from "../fixtures/skills/class6.json";
import class7Skills from "../fixtures/skills/class7.json";
import class8Skills from "../fixtures/skills/class8.json";
import tocById from "../fixtures/textbooks/toc-by-id.json";
import { buildSkillTree, buildTocTree, type FlatSkillRow, type FlatTocRow } from "./tree-utils";

const BOOKS: Record<number, unknown[]> = { 5: class5Books, 6: class6Books, 7: class7Books, 8: class8Books };
const SKILLS_FLAT: Record<number, FlatSkillRow[]> = {
  5: class5Skills as FlatSkillRow[],
  6: class6Skills as FlatSkillRow[],
  7: class7Skills as FlatSkillRow[],
  8: class8Skills as FlatSkillRow[],
};
const TOC_BY_ID = tocById as unknown as Record<string, FlatTocRow[]>;

function json(status: number, body: unknown): DemoResponse {
  return { status, body };
}

export function handleTextbook(req: DemoRequest): DemoResponse | null {
  const { method, path: reqPath } = req;

  if (method === "GET" && reqPath === "/textbooks") {
    const level = parseInt(req.searchParams.get("class_level") || "8", 10);
    return json(200, BOOKS[level] ?? BOOKS[8]);
  }

  if (method === "GET" && reqPath === "/textbooks/skills/tree") {
    const level = parseInt(req.searchParams.get("class_level") || "8", 10);
    const flat = SKILLS_FLAT[level] ?? SKILLS_FLAT[8];
    return json(200, buildSkillTree(flat, level));
  }

  const tocTreeMatch = reqPath.match(/^\/textbooks\/([^/]+)\/toc\/tree$/);
  if (method === "GET" && tocTreeMatch) {
    const flat = TOC_BY_ID[tocTreeMatch[1]] ?? [];
    return json(200, buildTocTree(flat));
  }

  const tocMatch = reqPath.match(/^\/textbooks\/([^/]+)\/toc$/);
  if (method === "GET" && tocMatch) {
    const flat = TOC_BY_ID[tocMatch[1]] ?? [];
    return json(200, buildTocTree(flat));
  }

  return null;
}
