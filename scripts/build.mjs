import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

function readLocalEnv(file) {
  return readFile(file, 'utf8')
    .then((content) => Object.fromEntries(content.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      })))
    .catch(() => ({}));
}

const localEnv = await readLocalEnv(path.join(root, '.env.local'));
const supabaseUrl = process.env.SUPABASE_URL || localEnv.SUPABASE_URL || '';
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || localEnv.SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no ambiente de build ou em .env.local.');
}
if (supabaseUrl.includes('your-project') || supabasePublishableKey.includes('replace_with')) {
  throw new Error('Substitua os valores de exemplo pelas credenciais públicas do projeto Supabase deste site.');
}
if (!supabasePublishableKey.startsWith('sb_publishable_')) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY precisa ser uma chave pública sb_publishable_; não use chaves secretas ou service_role.');
}

const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
  throw new Error('SUPABASE_URL deve usar HTTPS, exceto em localhost.');
}

const expectedOutput = path.resolve(root, 'dist');
if (path.resolve(output) !== expectedOutput || output === root) {
  throw new Error('Diretório de saída inválido.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'admin.html', 'recuperar-senha.html', 'redefinir-senha.html', 'portfolio.html', 'agenda-client.js', 'agenda.js', 'admin.js', 'admin.css', 'password-recovery.js', 'password-update.js', 'portfolio.js', 'portfolio.css', 'portfolio-admin.js', 'editorial-theme.css']) {
  await cp(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, 'img'), path.join(output, 'img'), { recursive: true });
await writeFile(
  path.join(output, 'supabase-config.js'),
  `export const supabaseUrl = ${JSON.stringify(supabaseUrl)};\nexport const supabasePublishableKey = ${JSON.stringify(supabasePublishableKey)};\n`,
  'utf8',
);
console.log('Site estático preparado em dist/.');

