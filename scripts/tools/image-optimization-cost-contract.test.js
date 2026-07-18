const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesAll(source, snippets, label) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${label} is missing: ${snippet}`);
  }
}

function imageBlocksFor(source, srcPattern) {
  const pattern = new RegExp(`<Image[\\s\\S]*?src=\\{${srcPattern}\\}[\\s\\S]*?\\/>`, "g");
  return source.match(pattern) || [];
}

function assertAllBlocksUnoptimized(blocks, label) {
  assert(blocks.length > 0, `${label} image blocks should exist`);
  blocks.forEach((block, index) => {
    assert(block.includes("unoptimized"), `${label} image block ${index + 1} should be unoptimized`);
  });
}

function run() {
  const nextConfig = read("next.config.ts");
  includesAll(
    nextConfig,
    [
      "deviceSizes: [640, 768, 1024, 1280]",
      "imageSizes: [32, 48, 64, 96, 128, 160, 256, 384]",
      "minimumCacheTTL: 2678400",
    ],
    "next image sizing config"
  );
  assert(
    !nextConfig.includes("1920") && !nextConfig.includes("3840"),
    "next image sizing config should not keep oversized default candidates"
  );

  const tierCard = read("components/players/TierPlayerCard.tsx");
  includesAll(
    tierCard,
    ["width={76}", "height={76}", "sizes=\"76px\"", "unoptimized"],
    "tier player small profile image"
  );

  const playerRow = read("components/players/PlayerRow.tsx");
  includesAll(
    playerRow,
    ["sizes=\"32px\"", "unoptimized"],
    "player row small profile image"
  );

  const legacyPlayerCard = read("components/PlayerCard.tsx");
  includesAll(
    legacyPlayerCard,
    ["sizes=\"32px\"", "unoptimized"],
    "legacy player row small profile image"
  );
  assertAllBlocksUnoptimized(
    imageBlocksFor(legacyPlayerCard, "profileImageUrl"),
    "legacy player card profile"
  );

  const playerCard = read("components/players/PlayerCard.tsx");
  includesAll(
    playerCard,
    ["const profileImageSizes =", "sizes={profileImageSizes}"],
    "large player card fill image"
  );
  assertAllBlocksUnoptimized(
    imageBlocksFor(playerCard, "profileUrl \\|\\| \"/placeholder-player\\.svg\""),
    "player card profile"
  );

  const playerSearchResult = read("app/player/PlayerSearchResult.tsx");
  includesAll(
    playerSearchResult,
    ["const profileImageSizes = \"124px\";", "sizes={profileImageSizes}"],
    "player search result fill image"
  );
  assertAllBlocksUnoptimized(
    imageBlocksFor(playerSearchResult, "profileImageUrl"),
    "player search result profile"
  );
}

run();
console.log("Image optimization cost contract passed.");
