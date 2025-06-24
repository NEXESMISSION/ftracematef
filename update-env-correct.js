const fs = require('fs');

const envContent = `VITE_SUPABASE_URL=https://kiitdkjtzxljuuursls.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaXRka3JqdHp4eGxqdXV1cnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTgyODksImV4cCI6MjA2NjI3NDI4OX0.FoYyyp2Atrqyd33yD9OB7dXNT9GOTW9LPCMAMKOjc4U
`;
 
fs.writeFileSync('.env', envContent);
console.log('✅ .env file updated with correct Supabase credentials!');
console.log('📝 URL: https://kiitdkjtzxljuuursls.supabase.co');
console.log('🔑 Anon Key: Updated with the correct key'); 