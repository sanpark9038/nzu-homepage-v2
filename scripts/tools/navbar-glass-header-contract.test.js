const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("navbar uses one shared component with home overlay and default sticky states", () => {
  const source = readProjectFile("components/Navbar.tsx");

  assert.match(source, /function normalizeNavbarPathname/);
  assert.match(source, /pathname === "\/index"/);
  assert.match(source, /function resolveNavbarPathname/);
  assert.doesNotMatch(source, /window\.location\.pathname/);
  assert.match(source, /return normalizeNavbarPathname\(pathname\)/);
  assert.match(source, /const isHome = resolvedPathname === "\/"/);
  assert.doesNotMatch(source, /: "\/";/);
  assert.match(source, /const isActive = resolvedPathname === item\.href/);
  assert.match(source, /isHome\s*\?\s*"fixed top-0/);
  assert.match(source, /:\s*"sticky top-0/);
  assert.match(source, /backdrop-blur-2xl/);
  assert.match(source, /bg-background\/18/);
  assert.doesNotMatch(source, /bg-background\/44/);
  assert.match(source, /bg-background\/72/);
  assert.doesNotMatch(source, /transition-all/);
});

test("navbar does not server-default every route to home overlay", () => {
  const source = readProjectFile("components/Navbar.tsx");

  assert.doesNotMatch(source, /typeof window !== "undefined" \? window\.location\.pathname : "\/"/);
  assert.match(source, /resolveNavbarPathname\(pathname\)/);
});

test("navbar session check runs from the shared root layout mount only", () => {
  const navbarSource = readProjectFile("components/Navbar.tsx");
  const layoutSource = readProjectFile("app/layout.tsx");

  assert.match(layoutSource, /<Navbar \/>/);
  assert.match(navbarSource, /fetch\("\/api\/auth\/session",\s*\{\s*cache:\s*"no-store"\s*\}\)/);
  assert.match(navbarSource, /useEffect\(\(\) => \{[\s\S]*?\/api\/auth\/session[\s\S]*?\},\s*\[\]\)/);
  assert.doesNotMatch(navbarSource, /useEffect\(\(\) => \{[\s\S]*?\/api\/auth\/session[\s\S]*?\},\s*\[pathname\]\)/);
  assert.doesNotMatch(navbarSource, /useEffect\(\(\) => \{[\s\S]*?\/api\/auth\/session[\s\S]*?\},\s*\[resolvedPathname\]\)/);
});

test("navbar buttons use shared readable sizing instead of tiny per-page typography", () => {
  const source = readProjectFile("components/Navbar.tsx");

  assert.match(source, /ui-label/);
  assert.match(source, /rounded-full/);
  assert.match(source, /min-h-\[40px\]/);
  assert.doesNotMatch(source, /text-\[10px\]/);
  assert.doesNotMatch(source, /text-\[14px\]/);
});

test("navbar avoids background route prefetch bursts", () => {
  const source = readProjectFile("components/Navbar.tsx");

  assert.match(source, /visibleNavbarLinks\.map/);
  assert.match(source, /href="\/"\s+prefetch=\{false\}/);
  assert.match(source, /href=\{item\.href\}/);
  assert.match(source, /prefetch=\{false\}/);
});

test("navbar does not expose the retired public teams page", () => {
  const source = readProjectFile("lib/navigation-config.ts");
  const navbarSource = readProjectFile("components/Navbar.tsx");

  assert.doesNotMatch(source, /href:\s*"\/teams"/);
  assert.doesNotMatch(source, /hiddenNavbarLinks[\s\S]*href:\s*"\/teams"/);
  assert.doesNotMatch(navbarSource, /showTeamsBadge/);
  assert.doesNotMatch(navbarSource, /Trophy/);
  assert.doesNotMatch(navbarSource, /border-emerald-300\/45/);
  assert.doesNotMatch(navbarSource, /EVENT/);
});

test("home hero fills the viewport when the navbar is overlaid", () => {
  const source = readProjectFile("app/page.tsx");

  assert.match(source, /h-\[100svh\]/);
  assert.match(source, /min-h-\[min\(560px,100svh\)\]/);
  assert.doesNotMatch(source, /min-h-\[560px\]/);
  assert.doesNotMatch(source, /h-\[calc\(100svh-4rem\)\]/);
});

test("home hero does not change opacity on page hover", () => {
  const source = readProjectFile("app/page.tsx");

  assert.doesNotMatch(source, /group-hover:opacity/);
  assert.doesNotMatch(source, /opacity-\[0\.03\]/);
});

test("main scroll container only shows a scrollbar when content overflows", () => {
  const source = readProjectFile("app/layout.tsx");

  assert.match(source, /id="main-scroll-container"/);
  assert.match(source, /overflow-y-auto/);
  assert.doesNotMatch(source, /overflow-y-scroll/);
});
