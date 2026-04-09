const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

function trim(value) {
  return String(value || "").trim();
}

function normalizeRace(value) {
  const raw = trim(value).toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("t")) return "terran";
  if (raw.startsWith("z")) return "zerg";
  if (raw.startsWith("p")) return "protoss";
  return raw;
}

function buildSoopChannelUrl(soopUserId) {
  const value = trim(soopUserId);
  return value ? `https://www.sooplive.com/station/${value}` : null;
}

function buildSoopProfileImageUrl(soopUserId) {
  const value = trim(soopUserId);
  return value
    ? `https://profile.img.sooplive.com/LOGO/af/${value}/${value}.jpg`
    : null;
}

function extractWrIdFromCustomUrl(url) {
  const raw = trim(url);
  if (!raw) return null;
  const match = raw.match(/wr_id=(\d+)/i);
  return match ? Number(match[1]) : null;
}

function resolveProfileKind(entry) {
  const customUrl = trim(entry.custom_elo_url);
  const eloId = trim(entry.elo_id);
  const tierGroup = trim(entry.tier_group).toLowerCase();
  if (/bo_table=bj_m_list/i.test(customUrl)) return "mix";
  if (eloId && tierGroup === "women") return "female";
  if (eloId && tierGroup === "men") return "male";
  if (customUrl) return "custom";
  return "unknown";
}

function normalizeReferenceEntry(entry, source) {
  const soopUserId = trim(entry.soop_user_id || entry.data_id);
  const sourceName = trim(entry.player_name || entry.data_name);
  const displayName = trim(entry.display_name || entry.player_name_text);
  const eloIdRaw = trim(entry.elo_id);
  const eloWrId = /^\d+$/.test(eloIdRaw)
    ? Number(eloIdRaw)
    : extractWrIdFromCustomUrl(entry.custom_elo_url);
  const normalized = {
    source_name: sourceName || null,
    display_name: displayName || null,
    alias_names: [],
    soop_user_id: soopUserId || null,
    broadcast_url:
      trim(entry.soop_channel_url) || buildSoopChannelUrl(soopUserId),
    profile_image_url: buildSoopProfileImageUrl(soopUserId),
    race: normalizeRace(entry.race),
    college: trim(entry.college) || null,
    tier_group: trim(entry.tier_group).toLowerCase() || null,
    elo_ref: {
      wr_id: Number.isFinite(eloWrId) ? eloWrId : null,
      direct_elo_id: /^\d+$/.test(eloIdRaw) ? Number(eloIdRaw) : null,
      custom_url: trim(entry.custom_elo_url) || null,
      profile_kind: resolveProfileKind(entry),
    },
    source_ref: {
      kind: source.kind,
      label: source.label,
    },
  };

  const aliases = new Set();
  if (normalized.display_name && normalized.display_name !== normalized.source_name) {
    aliases.add(normalized.display_name);
  }
  normalized.alias_names = Array.from(aliases);
  return normalized;
}

function parseHtmlReference(raw, source) {
  const $ = cheerio.load(String(raw || ""));
  const records = [];
  $("a.player-card").each((_, element) => {
    const card = $(element);
    records.push(
      normalizeReferenceEntry(
        {
          data_id: card.attr("data-id"),
          race: card.attr("data-race"),
          data_name: card.attr("data-name"),
          college: card.attr("data-college"),
          elo_id: card.attr("data-elo-id"),
          custom_elo_url: card.attr("data-custom-elo-url"),
          tier_group: card.attr("data-tier-group"),
          soop_channel_url: card.attr("href"),
          player_name_text: card.find(".player-name-text").first().text(),
        },
        source
      )
    );
  });
  return records.filter((row) => row.soop_user_id || row.source_name);
}

function parseFlatJsonReference(raw, source) {
  const parsed = JSON.parse(String(raw || "[]"));
  const rows = Array.isArray(parsed) ? parsed : [];
  return rows
    .map((row) => normalizeReferenceEntry(row, source))
    .filter((entry) => entry.soop_user_id || entry.source_name);
}

function dedupeNormalizedRecords(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key =
      trim(row.soop_user_id).toLowerCase() ||
      trim(row.source_name).toLowerCase() ||
      JSON.stringify(row);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, row);
      continue;
    }
    const current = byKey.get(key);
    const aliases = new Set([...(current.alias_names || []), ...(row.alias_names || [])]);
    byKey.set(key, {
      ...current,
      source_name: current.source_name || row.source_name,
      display_name: current.display_name || row.display_name,
      college: current.college || row.college,
      race: current.race || row.race,
      tier_group: current.tier_group || row.tier_group,
      elo_ref: {
        wr_id: current.elo_ref?.wr_id ?? row.elo_ref?.wr_id ?? null,
        direct_elo_id: current.elo_ref?.direct_elo_id ?? row.elo_ref?.direct_elo_id ?? null,
        custom_url: current.elo_ref?.custom_url || row.elo_ref?.custom_url || null,
        profile_kind:
          current.elo_ref?.profile_kind !== "unknown"
            ? current.elo_ref?.profile_kind
            : row.elo_ref?.profile_kind,
      },
      alias_names: Array.from(aliases).filter(Boolean),
    });
  }
  return Array.from(byKey.values());
}

function detectSourceKind(raw, filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  const text = String(raw || "").trim();
  if (ext === ".html" || text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
    return "html";
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    return "flat-json";
  }
  return "unknown";
}

function loadReferenceFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const kind = detectSourceKind(raw, filePath);
  const source = {
    kind,
    label: path.basename(filePath),
  };
  if (kind === "html") {
    return {
      source,
      records: dedupeNormalizedRecords(parseHtmlReference(raw, source)),
    };
  }
  if (kind === "flat-json") {
    return {
      source,
      records: dedupeNormalizedRecords(parseFlatJsonReference(raw, source)),
    };
  }
  throw new Error(`Unsupported SOOP reference source format: ${filePath}`);
}

module.exports = {
  buildSoopChannelUrl,
  buildSoopProfileImageUrl,
  dedupeNormalizedRecords,
  detectSourceKind,
  extractWrIdFromCustomUrl,
  loadReferenceFile,
  normalizeReferenceEntry,
  parseFlatJsonReference,
  parseHtmlReference,
  resolveProfileKind,
};
