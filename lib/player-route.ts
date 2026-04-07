export function buildPlayerHref(player: { id: string; name: string }) {
  const shortId = String(player.id || "").split("-")[0] || String(player.id || "");
  const slugName = String(player.name || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/?#%&]+/g, "");

  return `/player/${encodeURIComponent(`${slugName}--${shortId}`)}`;
}

export function parsePlayerSlug(slug: string) {
  const decoded = decodeURIComponent(String(slug || "").trim());
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(decoded)) {
    return { selectedId: decoded, selectedIdPrefix: "", query: "" };
  }

  const match = decoded.match(/^(.*)--([0-9a-f]{8})$/i);
  if (!match) {
    return { selectedId: "", selectedIdPrefix: "", query: decoded.replace(/-/g, " ") };
  }

  return {
    selectedId: "",
    selectedIdPrefix: match[2].toLowerCase(),
    query: match[1].replace(/-/g, " "),
  };
}
