
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Load player mapping data from player_metadata.json
const path = require('path');
const playerMetadataPath = path.join(__dirname, 'player_metadata.json');
let playerMetadata = {};
try {
  if (fs.existsSync(playerMetadataPath)) {
    playerMetadata = JSON.parse(fs.readFileSync(playerMetadataPath, 'utf8'));
    console.log(`Loaded ${Object.keys(playerMetadata).length} player metadata mappings.`);
  }
} catch (e) {
  console.warn('Warning: Could not load player_metadata.json:', e.message);
}

/**
 * Helper to get substituted name from metadata using wr_id.
 */
function getPlayerName(originalName, href) {
  if (!href) return originalName;
  const match = href.match(/wr_id=(\d+)/);
  if (match && playerMetadata[match[1]]) {
    return playerMetadata[match[1]];
  }
  return originalName;
}

/**
 * Fetches the master list of all players from the 'all_bj_list' page.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of player objects.
 */
async function fetchAllPlayers() {
  console.log("Fetching master player list from 'all_bj_list'...");
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list';
  
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });

    const $ = cheerio.load(html);
    const players = [];

    $('div.table-responsive table tbody tr').each((i, row) => {
      const nameAnchor = $(row).find('a.p_name');
      if (!nameAnchor.length) return;

      const rawNameText = nameAnchor.text().trim();
      const href = nameAnchor.attr('href');
      
      let rawName = rawNameText;
      let tier = 'N/A';
      const tierMatch = rawNameText.match(/\((.*?)\)/);
      if (tierMatch) {
        tier = tierMatch[1];
        rawName = rawNameText.replace(/\s*\((.*?)\)/, '').trim();
      }

      // Substitute name using metadata if available
      const name = getPlayerName(rawName, href);

      const cells = $(row).find('td');
      let race = 'N/A';
      if (cells.length > 1) {
        const raceText = $(cells[1]).text().trim();
        if (raceText.includes('Protoss')) race = 'P';
        else if (raceText.includes('Terran')) race = 'T';
        else if (raceText.includes('Zerg')) race = 'Z';
        else if (raceText.includes('Random')) race = 'R';
      }
      
      players.push({ name, tier, race, university: 'N/A' });
    });

    console.log(`Found ${players.length} players in the master list.`);
    return players;

  } catch (error) {
    console.error('Error fetching the master player list:', error.message);
    return [];
  }
}

/**
 * Fetches the mapping from University ID (wr_id) to University Name.
 * @returns {Promise<Object>} A map of { univId: univName }.
 */
async function fetchUnivIdToNameMap() {
    console.log("Fetching university ID-to-Name map...");
    const url = 'https://eloboard.com/univ/bbs/month_list.php';
    const idToNameMap = {};
    try {
        const { data: htmlFragment } = await axios.post(url, 'sear_=s9&b_id=eloboard', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });

        const $ = cheerio.load(`<table><tbody>${htmlFragment}</tbody></table>`);
        
        $('td.list-subject a').each((i, el) => {
            const href = $(el).attr('href');
            // Clone the element, remove child images, then get the text.
            const name = $(el).clone().children('img').remove().end().text().trim();
            const match = href.match(/wr_id=(\d+)/);
            if (match && name) {
                idToNameMap[match[1]] = name;
            }
        });

        console.log(`Built map for ${Object.keys(idToNameMap).length} universities.`);
        return idToNameMap;
    } catch (error) {
        console.error('Error fetching university ID-to-Name map:', error.message);
        return {};
    }
}


/**
 * Fetches the mapping from player name to their university ID from the season ranking page.
 * @returns {Promise<Object>} A map of { playerName: univId }.
 */
async function fetchPlayerToUnivIdMap() {
  console.log("Fetching player-to-university-ID map...");
  const url = 'https://eloboard.com/univ/bbs/p_month_list.php';
  const playerToUnivId = {};
  
  try {
    const { data: htmlFragment } = await axios.post(url, 'sear_=s9&b_id=eloboard', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    
    // The response is not a full HTML document, so we wrap it to parse
    const $ = cheerio.load(`<table><tbody>${htmlFragment}</tbody></table>`);

    $('tr').each((i, row) => {
        const univLink = $(row).find('td:nth-child(2) a');
        const univHref = univLink.attr('href');
        let univId = null;
        if (univHref) {
            const match = univHref.match(/wr_id=(\d+)/);
            if (match) univId = match[1];
        }
        
        const playerNameAnchor = $(row).find('td.list-subject a');
        const playerHref = playerNameAnchor.attr('href');
        
        // Cloned to remove the child `img` before getting the text
        const rawPlayerName = playerNameAnchor.clone().children().remove().end().text().trim();
        
        // Substitute name using metadata if available
        const playerName = getPlayerName(rawPlayerName, playerHref);

        if (playerName && univId) {
            playerToUnivId[playerName] = univId;
        }
    });

    console.log(`Found ${Object.keys(playerToUnivId).length} player-to-university mappings.`);
    return playerToUnivId;

  } catch (error) {
    console.error('Error fetching player-to-university-ID map:', error.message);
    return {};
  }
}

async function startSync() {
  console.log('Starting player data synchronization...');

  const [allPlayers, idToNameMap, playerToUnivIdMap] = await Promise.all([
    fetchAllPlayers(),
    fetchUnivIdToNameMap(),
    fetchPlayerToUnivIdMap()
  ]);
  
  if (!allPlayers || allPlayers.length === 0) {
    console.log('No players found from master list. Exiting.');
    return;
  }

  // Create the final player-to-university name map
  const playerToUnivNameMap = {};
  for (const playerName in playerToUnivIdMap) {
      const univId = playerToUnivIdMap[playerName];
      const univName = idToNameMap[univId];
      if (univName) {
          playerToUnivNameMap[playerName] = univName;
      }
  }

  const combinedData = allPlayers.map(player => {
    const university = playerToUnivNameMap[player.name.trim()];
    if (university) {
      return { ...player, university };
    }
    return player;
  });

  console.log(`Preparing to upsert ${combinedData.length} players to Supabase...`);

  const playersToUpsert = combinedData.map(player => ({
    name: player.name,
    tier: player.tier,
    race: player.race,
    university: player.university,
    last_synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('players')
    .upsert(playersToUpsert, { onConflict: 'name' });

  if (error) {
    console.error('Error upserting data to Supabase:', error.message);
    return;
  }

  console.log('Synchronization complete! Successfully upserted player data to Supabase.');
}

startSync();

