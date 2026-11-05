// The automatic check of UX pack rule 6 / LESSONS 108 (1): nothing leaves its own box and the page has no horizontal scroll.  `layoutProbe` runs INSIDE the page (`page.evaluate(layoutProbe, selector)`):
//  - an element whose content is wider than itself (`scrollWidth > clientWidth`) - also a scroll container that would scroll sideways (a tab bar says `data-allow-hscroll`);
//  - a piece of text outside its nearest block box, or outside the screen;
//  - the page itself wider than the screen.
function layoutProbe(rootSelector) {
  const root = document.querySelector(rootSelector) || document.body;
  const vw = window.innerWidth;
  const bad = [];
  const quiet = (el) => el.closest(".sr-only, [data-allow-hscroll]");
  const label = (el) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} «${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36)}»`;
  for (const el of root.querySelectorAll("*")) {
    if (quiet(el)) continue;
    const style = getComputedStyle(el);
    if (style.display === "inline" || style.display === "contents" || style.display === "none") continue;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "svg" || el.closest("svg")) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) bad.push(`${label(el)}: content ${el.scrollWidth} > box ${el.clientWidth}`);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent.trim() || !parent || quiet(parent)) continue;
    let block = parent;
    while (block && block !== document.body && ["inline", "contents"].includes(getComputedStyle(block).display)) block = block.parentElement;
    const box = block.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width === 0) continue;
      if (rect.left < -1 || rect.right > vw + 1) bad.push(`text «${node.textContent.trim().slice(0, 30)}» is off the screen (${Math.round(rect.left)}..${Math.round(rect.right)} of ${vw})`);
      else if (rect.right > box.right + 1 || rect.left < box.left - 1) bad.push(`text «${node.textContent.trim().slice(0, 30)}» leaves its block (${Math.round(rect.right)} > ${Math.round(box.right)})`);
    }
  }
  return { bad: [...new Set(bad)], scroll: document.documentElement.scrollWidth - vw };
}

module.exports = { layoutProbe };
