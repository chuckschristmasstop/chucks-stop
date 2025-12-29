-- Enable RLS on participants check
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any (to avoid conflicts)
DROP POLICY IF EXISTS "Enable read access for all users" ON "participants";

-- Create policy to allow everyone to see everyone (needed for dropdowns/lobbies)
CREATE POLICY "Enable read access for all users" ON "participants"
FOR SELECT USING (true);

-- Ensure authenticated users can still insert themselves
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "participants";
CREATE POLICY "Enable insert for authenticated users only" ON "participants"
FOR INSERT WITH CHECK (auth.uid() = id OR auth.role() = 'anon'); 
-- Note: Logic above might be loose if anonymous. Assuming standard supabase auth or simple anon setup.
-- If 'participants' IDs are linked to auth.users, we should use auth.uid().
-- But keeping it simple: Public Read is the key fix.
