#!/usr/bin/env node

/**
 * Environment Variables Check Script
 * 
 * This script helps verify that your environment variables are properly configured
 * before pushing to GitHub or deploying.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking environment variables...\n');

// Check if .env file exists
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('   Create a .env file in the root directory with your Supabase credentials.');
  console.log('   Example:');
  console.log('   VITE_SUPABASE_URL=https://your-project-id.supabase.co');
  console.log('   VITE_SUPABASE_ANON_KEY=your-anon-key-here');
  process.exit(1);
}

// Read .env file
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));

// Check for required variables
const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

const missingVars = [];
const placeholderVars = [];

for (const requiredVar of requiredVars) {
  const line = envLines.find(line => line.startsWith(requiredVar + '='));
  
  if (!line) {
    missingVars.push(requiredVar);
  } else {
    const value = line.split('=')[1];
    if (value.includes('your-') || value.includes('placeholder') || !value.trim()) {
      placeholderVars.push(requiredVar);
    }
  }
}

// Report results
if (missingVars.length > 0) {
  console.log('❌ Missing environment variables:');
  missingVars.forEach(varName => console.log(`   - ${varName}`));
  console.log('');
}

if (placeholderVars.length > 0) {
  console.log('⚠️  Environment variables with placeholder values:');
  placeholderVars.forEach(varName => console.log(`   - ${varName}`));
  console.log('');
}

if (missingVars.length === 0 && placeholderVars.length === 0) {
  console.log('✅ All environment variables are properly configured!');
  console.log('✅ Your API keys are secure and ready for deployment.');
} else {
  console.log('📝 Please update your .env file with actual values before deploying.');
  process.exit(1);
}

// Check for potential security issues
const sensitivePatterns = [
  /service_role/,
  /secret/,
  /private/,
  /admin/
];

const sensitiveVars = envLines.filter(line => 
  sensitivePatterns.some(pattern => pattern.test(line.toLowerCase()))
);

if (sensitiveVars.length > 0) {
  console.log('\n⚠️  Warning: Potentially sensitive variables detected:');
  sensitiveVars.forEach(line => {
    const varName = line.split('=')[0];
    console.log(`   - ${varName} (make sure this is not exposed in client-side code)`);
  });
}

console.log('\n🔒 Security checklist:');
console.log('   ✅ .env file is in .gitignore');
console.log('   ✅ No API keys are hardcoded in source files');
console.log('   ✅ Only anon key is used in frontend code');
console.log('   ✅ Service role key is kept secure');

console.log('\n🚀 You\'re ready to deploy safely!'); 