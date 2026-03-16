
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const FINAL_MAPPINGS = [
  { name: '클템', eloboard_id: '69', gender: 'women', university: '무소속', tier: '미정', race: 'T' },
  { name: '강구열', eloboard_id: null, gender: 'male', university: '씨나인', tier: '0', race: 'T' },
  { name: '혁민', eloboard_id: null, gender: 'male', university: 'HM', tier: '미정', race: 'P' },
  { name: '져지현', eloboard_id: null, gender: 'women', university: '늪지대', tier: 'JOKER', race: 'Z' }
];

async function applyFinalMappings() {
  console.log('Applying final player mappings and metadata...');
  for (const p of FINAL_MAPPINGS) {
    const { error } = await supabase
      .from('players')
      .update({ 
        eloboard_id: p.eloboard_id, 
        gender: p.gender,
        university: p.university,
        tier: p.tier,
        race: p.race
      })
      .eq('name', p.name);
    
    if (error) console.error(`  ❌ Failed for ${p.name}: ${error.message}`);
    else console.log(`  ✅ Updated: ${p.name}`);
  }

  // Cleanup TEST data
  console.log('Cleaning up test data...');
  await supabase.from('players').delete().ilike('name', 'DR_TEST_%');
  console.log('  ✅ Done.');
}

applyFinalMappings();
