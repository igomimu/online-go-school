-- ==========================================
-- dojo-app: 市川こども囲碁道場 初期スキーマ
-- ==========================================

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('admin', 'staff', 'parent')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'parent')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_kana TEXT,
    gender TEXT,
    birthdate DATE,
    grade TEXT,
    rank TEXT,
    student_type TEXT NOT NULL DEFAULT 'dojo' CHECK (student_type IN ('dojo', 'net', 'classroom')),
    entity TEXT NOT NULL DEFAULT 'shop_a',
    class_schedule TEXT[] DEFAULT '{}',
    enrollment_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
    tuition INTEGER NOT NULL DEFAULT 0,
    address TEXT,
    special_skill TEXT,
    memo TEXT,
    parent_profile_id UUID REFERENCES profiles(id),
    parent_name TEXT,
    parent_email TEXT,
    parent_phone TEXT,
    parent_line_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 20,
    class_type TEXT NOT NULL DEFAULT 'regular' CHECK (class_type IN ('regular', 'special', 'event')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    recorded_by UUID NOT NULL REFERENCES profiles(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, class_id, date)
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'waitlist')),
    created_by UUID NOT NULL REFERENCES profiles(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Absence Reports
CREATE TABLE IF NOT EXISTS absence_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id),
    date DATE NOT NULL,
    reason TEXT,
    reported_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES profiles(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    message_type TEXT NOT NULL CHECK (message_type IN ('notice', 'staff_chat', 'dm')),
    target_role TEXT CHECK (target_role IN ('admin', 'staff', 'parent')),
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message Recipients (for read tracking)
CREATE TABLE IF NOT EXISTS message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id),
    read_at TIMESTAMPTZ,
    UNIQUE(message_id, recipient_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_parent ON students(parent_profile_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_reservations_class_date ON reservations(class_id, date);
CREATE INDEX IF NOT EXISTS idx_absence_date ON absence_reports(date);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient ON message_recipients(recipient_id);

-- ==========================================
-- Row Level Security
-- ==========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;

-- Helper: get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles: users can read all, update own
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Students: staff/admin full access, parents see own children
CREATE POLICY "students_staff_all" ON students FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "students_parent_select" ON students FOR SELECT
    USING (get_user_role() = 'parent' AND parent_profile_id = auth.uid());

-- Classes: everyone can read, admin can modify
CREATE POLICY "classes_select" ON classes FOR SELECT USING (true);
CREATE POLICY "classes_admin_all" ON classes FOR ALL
    USING (get_user_role() = 'admin');

-- Attendance: staff/admin full access, parents read own children
CREATE POLICY "attendance_staff_all" ON attendance FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "attendance_parent_select" ON attendance FOR SELECT
    USING (
        get_user_role() = 'parent'
        AND student_id IN (SELECT id FROM students WHERE parent_profile_id = auth.uid())
    );

-- Reservations: staff/admin full, parents manage own children
CREATE POLICY "reservations_staff_all" ON reservations FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "reservations_parent_all" ON reservations FOR ALL
    USING (
        get_user_role() = 'parent'
        AND student_id IN (SELECT id FROM students WHERE parent_profile_id = auth.uid())
    );

-- Absence Reports: staff/admin can read all, parents can create for own children
CREATE POLICY "absence_staff_all" ON absence_reports FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "absence_parent_insert" ON absence_reports FOR INSERT
    WITH CHECK (
        get_user_role() = 'parent'
        AND student_id IN (SELECT id FROM students WHERE parent_profile_id = auth.uid())
    );
CREATE POLICY "absence_parent_select" ON absence_reports FOR SELECT
    USING (
        get_user_role() = 'parent'
        AND student_id IN (SELECT id FROM students WHERE parent_profile_id = auth.uid())
    );

-- Messages: staff/admin create, target-based read
CREATE POLICY "messages_staff_all" ON messages FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "messages_parent_select" ON messages FOR SELECT
    USING (
        get_user_role() = 'parent'
        AND (target_role = 'parent' OR message_type = 'dm')
    );

-- Message Recipients: users see own
CREATE POLICY "recipients_own" ON message_recipients FOR ALL
    USING (recipient_id = auth.uid());
CREATE POLICY "recipients_staff_all" ON message_recipients FOR ALL
    USING (get_user_role() IN ('admin', 'staff'));
