#!/usr/bin/env node
/**
 * Verificación de la biblioteca multimedia.
 *
 *   node scripts/verificar-biblioteca.mjs            # solo lectura
 *   node scripts/verificar-biblioteca.mjs --write    # + prueba real de subida/reemplazo (limpia al final)
 *
 * No imprime credenciales. Las comprobaciones de Supabase son de solo lectura
 * salvo el modo --write, que crea y elimina un único archivo de prueba.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const WRITE = process.argv.includes('--write');
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const env = { ...readEnv(path.join(root, '.env')), ...process.env };
const url = (env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
const anon = env.PUBLIC_SUPABASE_ANON_KEY || '';

async function rest(table, key, options = {}) {
  const response = await fetch(`${url}/rest/v1/${table}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  return { status: response.status, body };
}

async function bucketRequest(resource, key, options = {}) {
  const response = await fetch(`${url}/storage/v1/${resource}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  return { status: response.status, body };
}

/* ------------------------- 1. Archivos del proyecto ------------------------- */

const artifacts = [
  'db/media-library.sql',
  'src/pages/admin/medios.astro',
  'src/lib/media-library.ts',
  'src/lib/media-api.ts',
  ...['upload', 'replace', 'update', 'delete', 'attach', 'detach'].map(
    (name) => `src/pages/api/admin/media/${name}.ts`,
  ),
  'docs/biblioteca-multimedia.md',
];
const missing = artifacts.filter((file) => !fs.existsSync(path.join(root, file)));
check('Archivos de la funcionalidad presentes', missing.length === 0, missing.join(', '));

const nav = fs.readFileSync(path.join(root, 'src/lib/admin.ts'), 'utf8');
check('Ruta /admin/medios en la navegación', nav.includes("href: '/admin/medios'"));

const entryFile = path.join(root, 'dist/server/entry.mjs');
if (fs.existsSync(entryFile)) {
  const entry = fs.readFileSync(entryFile, 'utf8');
  const routes = ['upload', 'replace', 'update', 'delete', 'attach', 'detach'];
  const missingRoutes = routes.filter((name) => !entry.includes(`/api/admin/media/${name}`));
  check('Rutas API compiladas en dist/server', missingRoutes.length === 0, missingRoutes.join(', '));
}

/* --------------------- 2. Pruebas de funciones puras --------------------- */

try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-media-'));
  const entry = path.join(tmp, 'entry.mjs');
  const exports = ['src/lib/media-library.ts', 'src/lib/media-api.ts']
    .map((file, index) => `export *${index ? ' as api' : ''} from '${path.join(root, file).replace(/\\/g, '/')}';`)
    .join('\n');
  fs.writeFileSync(entry, exports);

  const built = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const out = path.join(tmp, 'bundle.mjs');
  fs.writeFileSync(out, built.outputFiles[0].text);
  const lib = await import(pathToFileURL(out).href);
  const api = lib.api;

  check('sanitizeBaseName', lib.sanitizeBaseName('Otoño Dorado ¡Foto!.JPG') === 'otono-dorado-foto');
  check(
    'makeStoragePath',
    /^library\/\d{4}-\d{2}\/mi-foto-[0-9a-f]{8}\.png$/.test(
      lib.makeStoragePath('Mi Foto.PNG', 'image/png') ?? '',
    ),
  );
  check('extensionFor', lib.extensionFor('image/jpeg') === 'jpg' && lib.extensionFor('text/plain') === null);
  check(
    'referencesPath',
    lib.referencesPath(
      'https://x.supabase.co/storage/v1/object/public/product-images/library/2026-11/a.jpg',
      'library/2026-11/a.jpg',
    ) &&
      !lib.referencesPath(
        'https://x.supabase.co/storage/v1/object/public/product-images/library/2026-11/b.jpg',
        'library/2026-11/a.jpg',
      ),
  );
  check('isUuid', lib.isUuid('123e4567-e89b-42d3-a456-426614174000') && !lib.isUuid('no-uuid'));
  check('isMediaBucket', lib.isMediaBucket('collection-images') && !lib.isMediaBucket('otro'));
  check('formatBytes', lib.formatBytes(1536) === '1.5 KB');
  check(
    'validateImage / isUploadedFile',
    api.validateImage(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })) === null &&
      api.validateImage(new File([new Uint8Array(8)], 'a.txt', { type: 'text/plain' })) !== null &&
      api.isUploadedFile(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })) &&
      !api.isUploadedFile('texto'),
  );
} catch (error) {
  check('Pruebas de funciones puras', false, error.message);
}

/* --------------------------- 3. Supabase en vivo --------------------------- */

if (!url || !service || !anon) {
  check('Variables de Supabase configuradas', false, 'Revisa .env (PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)');
} else {
  check('Variables de Supabase configuradas', true);

  const table = await rest('media_assets?select=id,name,bucket,path,url&limit=1', service);
  check(
    'Tabla media_assets con columna bucket (service_role)',
    table.status === 200,
    `HTTP ${table.status}${table.status !== 200 ? ` · ${JSON.stringify(table.body).slice(0, 160)}` : ''}`,
  );

  const bucketsRes = await bucketRequest('bucket', service);
  const buckets = Array.isArray(bucketsRes.body) ? bucketsRes.body.map((item) => item.id) : [];
  check(
    'Buckets product-images y collection-images',
    buckets.includes('product-images') && buckets.includes('collection-images'),
    buckets.join(', '),
  );

  const anonRes = await rest('media_assets?select=id', anon);
  const anonRows = Array.isArray(anonRes.body) ? anonRes.body : [];
  check(
    'RLS: anon no puede leer la biblioteca',
    anonRes.status !== 200 || anonRows.length === 0,
    `HTTP ${anonRes.status} · ${anonRows.length} filas visibles`,
  );

  for (const related of ['product_images?select=id&limit=1', 'collection_images?select=id&limit=1', 'collections?select=id&limit=1']) {
    const res = await rest(related, service);
    check(`Tabla ${related.split('?')[0]} accesible`, res.status === 200, `HTTP ${res.status}`);
  }

  /* ---------- 4. Prueba real de subida y reemplazo (modo --write) ---------- */

  if (WRITE) {
    // PNG 1x1 transparente y una variante distinta para comprobar el reemplazo.
    const pngA = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const pngB = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    );
    const objectPath = `library/_verify/verificar-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.png`;
    const publicUrl = `${url}/storage/v1/object/public/product-images/${objectPath}`;
    let assetId = null;

    try {
      const upA = await bucketRequest(`object/product-images/${objectPath}`, service, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' },
        body: pngA,
      });
      check('Subida real al bucket product-images', upA.status === 200 || upA.status === 201, `HTTP ${upA.status}`);

      const created = await rest('media_assets', service, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          name: 'Verificación automática',
          file_name: 'verificar.png',
          bucket: 'product-images',
          path: objectPath,
          url: publicUrl,
          mime_type: 'image/png',
          size_bytes: pngA.length,
        }),
      });
      assetId = Array.isArray(created.body) ? created.body[0]?.id : null;
      check('Registro real en media_assets', created.status === 201 && Boolean(assetId), `HTTP ${created.status}`);

      const readBack = await rest(`media_assets?id=eq.${assetId}&select=id,bucket,path,url`, service);
      check(
        'Lectura del asset (URL canónica guardada)',
        readBack.status === 200 && readBack.body[0]?.url === publicUrl,
      );

      const upB = await bucketRequest(`object/product-images/${objectPath}`, service, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'x-upsert': 'true' },
        body: pngB,
      });
      check('Reemplazo real sobre la misma ruta', upB.status === 200, `HTTP ${upB.status}`);

      const after = await fetch(publicUrl);
      const bytes = Buffer.from(await after.arrayBuffer());
      check(
        'La URL no cambia y sirve el contenido nuevo',
        after.status === 200 && bytes.equals(pngB),
        `HTTP ${after.status} · ${bytes.length} bytes`,
      );
    } catch (error) {
      check('Prueba real de subida/reemplazo', false, error.message);
    } finally {
      if (assetId) await rest(`media_assets?id=eq.${assetId}`, service, { method: 'DELETE' });
      await bucketRequest(`object/product-images/${objectPath}`, service, { method: 'DELETE' });
      check('Limpieza del archivo y registro de prueba', true);
    }
  } else {
    console.log('INFO  Prueba de subida/reemplazo omitida (usa --write para ejecutarla).');
  }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas.`);
if (failed.length) {
  console.log('Fallos: ' + failed.map((item) => item.name).join(', '));
  process.exit(1);
}
