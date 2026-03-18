const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = {
  supabase,
  BJ_NAME_MAPPING: {
    '김성민': '구라미스',
    '박현재': '기뉴다',
    '김재현': '샤이니',
    '박준영': '미동미동',
    '김동민': '액션구드론',
    '우규민': '초난강',
    'Judge현': '져지현'
  }
};
