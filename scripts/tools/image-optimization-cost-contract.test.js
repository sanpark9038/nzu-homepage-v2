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

function run() {
  const nextConfig = read("next.config.ts");
  includesAll(
    nextConfig,
    [
      "deviceSizes: [640, 768, 1024, 1280]",
      "imageSizes: [32, 48, 64, 96, 128, 160, 256, 384]",
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

  const playerCard = read("components/players/PlayerCard.tsx");
  includesAll(
    playerCard,
    ["const profileImageSizes =", "sizes={profileImageSizes}"],
    "large player card fill image"
  );

  const playerSearchResult = read("app/player/PlayerSearchResult.tsx");
  includesAll(
    playerSearchResult,
    ["const profileImageSizes = \"112px\";", "sizes={profileImageSizes}"],
    "player search result fill image"
  );
}

run();
console.log("Image optimization cost contract passed.");
