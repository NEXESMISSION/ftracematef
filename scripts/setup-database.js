// Database setup script for TraceMate
// This script checks if the required tables exist and creates them if they don't

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Check if credentials are available
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Supabase credentials not found in environment variables.');
  console.log('Please add VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY to your .env file.');
  console.log('Note: For this script, you need to use the service_role key, not the anon key.');
  process.exit(1);
}

// Create Supabase client with service role key (admin privileges)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  console.log('Starting database setup...');

  try {
    // Check if users table exists
    console.log('Checking if users table exists...');
    const { data: usersTable, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (usersError && usersError.code === '42P01') {
      console.log('Users table does not exist. Creating it...');
      console.log('Please create the users table manually in the Supabase dashboard.');
      console.log('Required columns: id (UUID, primary key), email (text), role (text, default: "free")');
    } else if (usersError) {
      console.error('Error checking users table:', usersError);
    } else {
      console.log('Users table already exists.');
    }

    // Check if usage_sessions table exists
    console.log('Checking if usage_sessions table exists...');
    const { data: sessionsTable, error: sessionsError } = await supabase
      .from('usage_sessions')
      .select('id')
      .limit(1);

    if (sessionsError && sessionsError.code === '42P01') {
      console.log('Usage sessions table does not exist. Creating it...');
      console.log('Please create the usage_sessions table manually in the Supabase dashboard.');
      console.log('Required columns: id (UUID, primary key), user_id (UUID, foreign key), started_at (timestamp), duration_secs (integer), completed (boolean)');
    } else if (sessionsError) {
      console.error('Error checking usage_sessions table:', sessionsError);
    } else {
      console.log('Usage sessions table already exists.');
    }

    console.log('\nDatabase setup complete.');
    console.log('\nIf you need to create tables manually, here are the SQL commands:');
    console.log(`
-- Create users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'paid'))
);

-- Create RLS policies for users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Create usage_sessions table
CREATE TABLE public.usage_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  duration_secs INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false
);

-- Create RLS policies for usage_sessions table
ALTER TABLE public.usage_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own usage sessions" ON public.usage_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own usage sessions" ON public.usage_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own usage sessions" ON public.usage_sessions
  FOR UPDATE USING (auth.uid() = user_id);
    `);

  } catch (error) {
    console.error('Unexpected error during database setup:', error);
  }
}

setupDatabase();
