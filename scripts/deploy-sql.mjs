import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = 'https://ishflkcsdzlhhxtanhxf.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_KEY environment variable required');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const sql = fs.readFileSync('./supabase/migrations/20260909_update_shared_item_rpcs.sql', 'utf8');
  
  // Split into individual statements
  const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
  
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    
    console.log(`Executing: ${trimmed.substring(0, 80)}...`);
    
    const { error } = await supabase.rpc('pg_execute', { query: trimmed });
    
    if (error) {
      // Try direct SQL via REST
      const res = await fetch(`${url}/rest/v1/rpc/pg_execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'apikey': serviceKey,
        },
        body: JSON.stringify({ query: trimmed }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed: ${text}`);
      } else {
        console.log('  ✓ OK');
      }
    } else {
      console.log('  ✓ OK');
    }
  }
}

main().catch(console.error);
