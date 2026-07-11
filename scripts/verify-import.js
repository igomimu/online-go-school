import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  });
  return env;
};

const env = loadEnv();
const supabase = createClient(env.VITE_DOJO_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  const { count: sCount, error: sErr } = await supabase.from('go_school_students').select('*', { count: 'exact', head: true });
  const { count: cCount, error: cErr } = await supabase.from('go_school_classrooms').select('*', { count: 'exact', head: true });
  
  if (sErr) console.error('Student count error:', sErr);
  else console.log('Total students in DB:', sCount);

  if (cErr) console.error('Classroom count error:', cErr);
  else console.log('Total classrooms in DB:', cCount);
}

verify();
