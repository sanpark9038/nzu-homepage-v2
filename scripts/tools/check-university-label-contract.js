const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const metadataPath = path.join(root, "data", "metadata", "universities.v1.json");
const configPath = path.join(root, "lib", "university-config.ts");

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function readMetadata() {
  return JSON.parse(fs.readFileSync(metadataPath, "utf8").replace(/^\uFEFF/, ""));
}

function findUniversity(doc, code) {
  return Array.isArray(doc.universities) ? doc.universities.find((entry) => entry.code === code) : null;
}

function expectAliases(entry, aliases) {
  for (const alias of aliases) {
    expect(entry.aliases?.includes(alias), `${entry.code} aliases must include "${alias}"`);
  }
}

function run() {
  const metadata = readMetadata();
  const configText = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");

  const ku = findUniversity(metadata, "KU");
  expect(ku, "KU metadata entry is missing");
  expect(ku.name === "케이대", `KU name must be "케이대", got "${ku?.name}"`);
  expectAliases(ku, ["KU", "K.U", "케이대"]);

  const ncs = findUniversity(metadata, "N.C.S");
  expect(ncs, "N.C.S metadata entry is missing");
  expect(ncs.name === "뉴캣슬", `N.C.S name must be "뉴캣슬", got "${ncs?.name}"`);
  expectAliases(ncs, ["NCS", "N.C.S", "뉴캣슬"]);

  const wfu = findUniversity(metadata, "WFU");
  expect(wfu, "WFU metadata entry is missing");
  expect(wfu.name === "와플대", `WFU name must be "와플대", got "${wfu?.name}"`);
  expectAliases(wfu, ["WFU", "와플대"]);

  expect(/KU:\s*\{\s*name:\s*"케이대"/u.test(configText), 'university-config KU label must be "케이대"');
  expect(/"N\.C\.S":\s*\{\s*name:\s*"뉴캣슬"/u.test(configText), 'university-config N.C.S label must be "뉴캣슬"');
  expect(/WFU:\s*\{\s*name:\s*"와플대"/u.test(configText), 'university-config WFU label must be "와플대"');
  expect(/"K\.U":\s*"KU"/u.test(configText), 'university-config must keep "K.U" alias for KU');
  expect(/케이대:\s*"KU"/u.test(configText), 'university-config must keep "케이대" alias for KU');
  expect(/NCS:\s*"N\.C\.S"/u.test(configText), 'university-config must keep "NCS" alias for N.C.S');
  expect(/뉴캣슬:\s*"N\.C\.S"/u.test(configText), 'university-config must keep "뉴캣슬" alias for N.C.S');

  console.log("[check-university-label-contract] PASS");
}

run();
