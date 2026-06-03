-- Feedback table for staff trial phase
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    category TEXT NOT NULL DEFAULT 'general',
    body TEXT NOT NULL,
    page_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- staff/admin can insert their own feedback
CREATE POLICY feedback_insert ON feedback
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('staff', 'admin')
        )
    );

-- admin can read all feedback
CREATE POLICY feedback_select ON feedback
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Index for admin listing
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
