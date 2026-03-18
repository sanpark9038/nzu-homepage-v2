const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Load player mapping data from player_metadata.json
const playerMetadataPath = path.join(__dirname, 'player_metadata.json');
let playerMetadata = {};
try {
  if (fs.existsSync(playerMetadataPath)) {
    playerMetadata = JSON.parse(fs.readFileSync(playerMetadataPath, 'utf8'));
    console.log(`Loaded ${Object.keys(playerMetadata).length} player metadata mappings.`);
  }
} catch (e) {
  console.error('Error loading metadata:', e.message);
  process.exit(1);
}

// Invert metadata to get name -> id
const nameToId = {};
for (const [id, name] of Object.entries(playerMetadata)) {
  nameToId[name] = id;
}

async function enhancePlayers() {
  console.log('Fetching players from Supabase...');
  const { data: players, error } = await supabase.from('players').select('id, name');
  if (error) {
    console.error('Error fetching players:', error.message);
    return;
  }

  console.log(`Found ${players.length} players. Updating with eloboard_id...`);

  const updates = players.map(player => {
    const eloboard_id = nameToId[player.name];
    if (eloboard_id) {
      return { id: player.id, eloboard_id };
    }
    return null;
  }).filter(Boolean);

  console.log(`Preparing to update ${updates.length} players...`);

  for (const update of updates) {
      const { error: updateError } = await supabase
        .from('players')
        .update({ eloboard_id: update.eloboard_id })
        .eq('id', update.id);
      
      if (updateError) {
          console.error(`Failed to update ${update.id}: ${updateError.message}`);
      }
  }

  console.log('Update complete!');
}

enhancePlayers();
