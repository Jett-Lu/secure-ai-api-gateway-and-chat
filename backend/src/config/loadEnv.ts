import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Works from src/ and dist/ and regardless of npm's workspace working directory.
try { loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Unable to load environment file'); }
