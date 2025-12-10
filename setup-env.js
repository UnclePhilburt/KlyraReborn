import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const clientEnv = `# WebSocket Server URL
# For development (local server)
VITE_SERVER_URL=ws://localhost:3000

# For production (Render deployment)
# VITE_SERVER_URL=wss://your-app-name.onrender.com
`;

const serverEnv = `# Server Configuration
PORT=3000

# Database Configuration (PostgreSQL) - Optional for now
# DATABASE_URL=postgresql://username:password@hostname:5432/database_name

# Session Secret
SESSION_SECRET=dev-secret-change-in-production
`;

// Create .env files if they don't exist
const clientEnvPath = join(__dirname, 'client', '.env');
const serverEnvPath = join(__dirname, 'server', '.env');

if (!existsSync(clientEnvPath)) {
    writeFileSync(clientEnvPath, clientEnv);
    console.log('✅ Created client/.env');
} else {
    console.log('ℹ️  client/.env already exists');
}

if (!existsSync(serverEnvPath)) {
    writeFileSync(serverEnvPath, serverEnv);
    console.log('✅ Created server/.env');
} else {
    console.log('ℹ️  server/.env already exists');
}

console.log('\n🎮 Environment setup complete!');
console.log('\nNext steps:');
console.log('1. Run "npm run dev:server" in one terminal');
console.log('2. Run "npm run dev:client" in another terminal');
console.log('3. Open http://localhost:5173 in your browser\n');
