function buildServingIdentityKey(row) {
  const eloboardId = String(row && row.eloboard_id ? row.eloboard_id : "").trim();
  const gender = String(row && row.gender ? row.gender : "").trim().toLowerCase();
  const match = eloboardId.match(/^eloboard:(male|female)(:mix)?:(\d+)$/i);

  if (match) {
    return `${gender || match[1].toLowerCase()}:${match[3]}`;
  }

  if (eloboardId) {
    return `entity:${eloboardId.toLowerCase()}`;
  }

  return null;
}

function withServingIdentityKey(row, enabled) {
  if (!enabled) return row;
  return {
    ...row,
    serving_identity_key: buildServingIdentityKey(row),
  };
}

async function tableHasColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

module.exports = {
  buildServingIdentityKey,
  tableHasColumn,
  withServingIdentityKey,
};
