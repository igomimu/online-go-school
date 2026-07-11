import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env variables manually from .env.local
const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found');
  }
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
const supabaseUrl = env.VITE_DOJO_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase URL or Service Role Key missing in .env.local');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Convert CSV grade value to grade display
function gradeToDisplay(gradeNum) {
  if (gradeNum <= 0) return '';
  if (gradeNum >= 1 && gradeNum <= 6) return `小${gradeNum}`;
  if (gradeNum >= 7 && gradeNum <= 9) return `中${gradeNum - 6}`;
  if (gradeNum >= 10 && gradeNum <= 12) return `高${gradeNum - 9}`;
  if (gradeNum >= 13 && gradeNum <= 15) return '大学';
  if (gradeNum >= 16) return '大人';
  return '';
}

// Extract birthdate from ID (8-digit number) verifying it's a valid date
function extractBirthdate(id) {
  const digits = id.replace(/\D/g, '');
  if (digits.length < 8) return null;

  for (let i = digits.length - 8; i >= 0; i--) {
    const chunk = digits.substring(i, i + 8);
    const year = parseInt(chunk.substring(0, 4));
    const month = parseInt(chunk.substring(4, 6));
    const day = parseInt(chunk.substring(6, 8));

    if (year >= 1900 && year <= 2026 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

// Simple CSV parser supporting double quotes
const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

async function main() {
  const csvPath = '/home/mimura/ClassInfo_TM201611080723_20260711133612.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let currentBlock = null;
  const classrooms = [];
  const students = [];
  const typeMap = {};
  const studentClassMap = new Map();

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Remove UTF-8 BOM if present
    if (line.charCodeAt(0) === 0xFEFF) {
      line = line.substring(1);
    }

    // Block header check
    if (line.startsWith('ID,FullName,Sex,Rank,UserDefRank,Type,Grade,Country,Cmt,Email,KifuHis')) {
      currentBlock = 'student';
      continue;
    } else if (line.startsWith('ID,FullName,Sex,Rank')) {
      currentBlock = 'teacher';
      continue;
    } else if (line.startsWith('ID,Name,Lang,Rank,WatcherCnt,WatcherID,AnWatcher,RealClassroom,RoomCapacity,Desc,StuIDs')) {
      currentBlock = 'classroom';
      continue;
    } else if (line.startsWith('Code,TypeName')) {
      currentBlock = 'type';
      continue;
    }

    const columns = parseCsvLine(line);

    if (currentBlock === 'type') {
      const code = columns[0];
      const typeName = columns[1];
      if (code && typeName) {
        typeMap[code] = typeName;
      }
    } else if (currentBlock === 'classroom') {
      const id = columns[0];
      const name = columns[1];
      const roomCapacity = parseInt(columns[8]) || 10;
      const stuIdsStr = columns[10] || '';
      
      if (id && name) {
        classrooms.push({
          id,
          name,
          max_capacity: roomCapacity
        });

        // Record student membership
        const studentIds = stuIdsStr.split(/\s+/).filter(Boolean);
        studentIds.forEach((sid, index) => {
          studentClassMap.set(sid, { classroomId: id, position: index });
        });
      }
    } else if (currentBlock === 'student') {
      const id = columns[0];
      if (!id || !id.startsWith('SM')) continue;

      const name = columns[1] || '';
      const rank = columns[3] || '';
      const internalRating = columns[4] || '';
      const typeCode = columns[5] || '';
      const gradeVal = parseInt(columns[6]) || 0;
      const country = columns[7] || '';
      
      const typeName = typeMap[typeCode] || '';
      const displayGrade = gradeToDisplay(gradeVal);

      const birthdate = extractBirthdate(id);

      const membership = studentClassMap.get(id);

      students.push({
        login_id: id,
        name,
        classroom_id: membership?.classroomId ?? null,
        classroom_position: membership?.position ?? null,
        rank,
        internal_rating: internalRating,
        student_type: typeName,
        grade: displayGrade,
        country,
        birthdate,
        updated_at: new Date().toISOString()
      });
    }
  }

  console.log(`Parsed ${classrooms.length} classrooms and ${students.length} students.`);

  // Upsert Classrooms
  if (classrooms.length > 0) {
    console.log('Upserting classrooms...');
    const { error: err } = await supabase
      .from('go_school_classrooms')
      .upsert(classrooms, { onConflict: 'id' });
    if (err) {
      console.error('Error upserting classrooms:', err);
      process.exit(1);
    }
    console.log('Classrooms upserted successfully.');
  }

  // Upsert Students
  if (students.length > 0) {
    console.log('Upserting students...');
    const chunkSize = 100;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      const { error: err } = await supabase
        .from('go_school_students')
        .upsert(chunk, { onConflict: 'login_id' });
      if (err) {
        console.error(`Error upserting students chunk ${i}-${i + chunk.length}:`, err);
        process.exit(1);
      }
    }
    console.log('Students upserted successfully.');
  }

  console.log('Import completed successfully!');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
