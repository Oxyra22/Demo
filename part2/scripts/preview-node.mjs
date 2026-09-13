import { createReadStream, existsSync, statSync, cpSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// A preview always serves one immutable build: rebuilding dist cannot remove
// the chunks referenced by an already loaded worker or a user's open page.
// Restart this command after a successful build to select the new snapshot.
const snapshot = mkdtempSync(join(tmpdir(), 'oxyra-demo-preview-'));
cpSync(resolve('dist'), snapshot, { recursive: true });
const workerPromise = import(pathToFileURL(join(snapshot, 'server/index.js')).href).then(module => module.default);
const currentWorker = () => workerPromise;
const clientRoot = join(snapshot, 'client');
const port = Number.parseInt(process.env.PORT ?? '4173', 10);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function assetPath(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const candidate = resolve(join(clientRoot, relative));
  return candidate.startsWith(`${clientRoot}/`) ? candidate : null;
}

const assets = {
  async fetch(request) {
    const filePath = assetPath(request.url);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      return new Response('Not found', { status: 404 });
    }
    const headers = new Headers({
      'content-type':
        contentTypes[extname(filePath).toLowerCase()] ??
        'application/octet-stream',
    });
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      status: 200,
      headers,
    });
  },
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host ?? `127.0.0.1:${port}`;
    const url = new URL(incoming.url ?? '/', `http://${host}`);
    const directAsset = assetPath(url);
    if (
      directAsset &&
      existsSync(directAsset) &&
      statSync(directAsset).isFile()
    ) {
      const response = await assets.fetch(new Request(url));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      if (!response.body || incoming.method === 'HEAD') {
        outgoing.end();
        return;
      }
      Readable.fromWeb(response.body).pipe(outgoing);
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value))
        value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }

    const init = { method: incoming.method, headers };
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      init.body = Readable.toWeb(incoming);
      init.duplex = 'half';
    }

    const worker = await currentWorker();
    const response = await worker.fetch(
      new Request(url, init),
      {
        ASSETS: assets,
      },
      {
        waitUntil(promise) {
          Promise.resolve(promise).catch(console.error);
        },
      },
    );

    outgoing.statusCode = response.status;
    outgoing.setHeader('Cache-Control', 'no-store');
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    if (!response.body || incoming.method === 'HEAD') {
      outgoing.end();
      return;
    }
    Readable.fromWeb(response.body).pipe(outgoing);
  } catch (error) {
    console.error(error);
    outgoing.statusCode = 500;
    outgoing.end('Preview server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Node preview listening on http://127.0.0.1:${port}`);
});
