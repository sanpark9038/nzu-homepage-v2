function normalizeName(name) {
  return String(name || "").trim();
}

const SPECIAL_PROFILE_URL_BY_NAME = {
  쌍디: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=671",
  빡재TV: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=913",
  케이: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=205",
};

function resolveSpecialProfileUrlByName(name, fallbackUrl = null) {
  const hit = SPECIAL_PROFILE_URL_BY_NAME[normalizeName(name)];
  return hit || fallbackUrl;
}

function isMixBoardProfileUrl(url) {
  return /bo_table=bj_m_list/i.test(String(url || ""));
}

function toMixBoardProfileUrl(url) {
  const text = String(url || "");
  if (!text) return null;
  if (isMixBoardProfileUrl(text)) return text;
  if (/bo_table=bj_list/i.test(text)) return text.replace(/bo_table=bj_list/i, "bo_table=bj_m_list");
  return null;
}

function shouldUseMixEndpoint(player) {
  if (!player || typeof player !== "object") return false;
  if (SPECIAL_PROFILE_URL_BY_NAME[normalizeName(player.name)]) return true;
  if (isMixBoardProfileUrl(player.profile_url)) return true;
  return false;
}

function defaultProfileUrlForPlayer(player) {
  const byName = resolveSpecialProfileUrlByName(player && player.name);
  if (byName) return byName;
  const board = player && player.gender === "male" ? "men" : "women";
  const wrId = Number(player && player.wr_id);
  return `https://eloboard.com/${board}/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
}

module.exports = {
  SPECIAL_PROFILE_URL_BY_NAME,
  resolveSpecialProfileUrlByName,
  isMixBoardProfileUrl,
  toMixBoardProfileUrl,
  shouldUseMixEndpoint,
  defaultProfileUrlForPlayer,
};
