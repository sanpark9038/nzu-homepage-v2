
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const MAPPINGS = [
  { name: '김인호', eloboard_id: '150', gender: 'male' },
  { name: '밍둥이', eloboard_id: '1011', gender: 'women' },
  { name: '뽀현욱', eloboard_id: '430', gender: 'women' },
  { name: '시조새', eloboard_id: '332', gender: 'women' }, // Found in women/bj_m_list
  { name: '이영숙', eloboard_id: '901', gender: 'women' },
  { name: '저그맨박성준', eloboard_id: '211', gender: 'male' },
  { name: '초난강', eloboard_id: '85', gender: 'male' },
  { name: '쿨지지', eloboard_id: '155', gender: 'male' },
  { name: '쿰신', eloboard_id: '124', gender: 'male' }
];

async function applyManualMappings() {
  console.log('Applying manual mappings for tricky players...');
  for (const m of MAPPINGS) {
    const { error } = await supabase
      .from('players')
      .update({ eloboard_id: m.eloboard_id, gender: m.gender })
      .eq('name', m.name);
    
    if (error) console.error(`  ❌ Failed for ${m.name}: ${error.message}`);
    else console.log(`  ✅ Mapped: ${m.name} -> ${m.eloboard_id}`);
  }
}

applyManualMappings();
