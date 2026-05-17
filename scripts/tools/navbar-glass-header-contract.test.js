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

  assert.match(source, /const isHome = pathname === "\/"/);
  assert.match(source, /isHome\s*\?\s*"fixed top-0/);
  assert.match(source, /:\s*"sticky top-0/);
  assert.match(source, /backdrop-blur-2xl/);
  assert.match(source, /bg-background\/18/);
  assert.match(source, /bg-background\/72/);
});

test("navbar buttons use shared readable sizing instead of tiny per-page typography", () => {
  const source = readProjectFile("components/Navbar.tsx");

  assert.match(source, /ui-label/);
  assert.match(source, /rounded-full/);
  assert.match(source, /min-h-\[40px\]/);
  assert.doesNotMatch(source, /text-\[10px\]/);
  assert.doesNotMatch(source, /text-\[14px\]/);
});

test("home hero fills the viewport when the navbar is overlaid", () => {
  const source = readProjectFile("app/page.tsx");

  assert.match(source, /h-\[100svh\]/);
  assert.doesNotMatch(source, /h-\[calc\(100svh-4rem\)\]/);
});
