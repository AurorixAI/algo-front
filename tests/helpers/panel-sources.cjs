// WE-E (E1): the lesson panel of the teacher is no longer written inside the two pages: its rules are `lib/use-teacher-lesson-panel.ts` (+ `lib/lesson-panel-view.ts`)
// and its picture `components/teacher/lesson-panel.tsx`. A test that pins a line of the panel reads the page TOGETHER with these files (the line is where it is now).
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const PANEL_FILES = ["src/lib/use-teacher-lesson-panel.ts", "src/lib/lesson-panel-view.ts", "src/components/teacher/lesson-panel.tsx"];
const panelText = () => PANEL_FILES.map((file) => `\n/* ── ${file} ── */\n${fs.readFileSync(path.join(root, file), "utf8")}`).join("\n");
const isPanelPage = (p) => /(^|\/)app\/teacher\/(dashboard|schedule)\/page\.tsx$/.test(String(p).replace(/\\/g, "/"));

/** wraps a test's `read(path)`: the two teacher pages come with the shared panel files appended */
const withPanel = (read) => (p) => (isPanelPage(p) ? read(p) + panelText() : read(p));

module.exports = { withPanel, panelText, PANEL_FILES, isPanelPage };
