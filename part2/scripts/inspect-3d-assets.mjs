import { readFile, readdir } from 'node:fs/promises';

const modelPaths = [
  'public/models/halloween/pumpkin-carved.glb',
  'public/models/halloween/character-ghost.glb',
  'public/models/halloween/lantern-glass.glb',
];

function parseGlbJson(buffer) {
  if (buffer.subarray(0, 4).toString('ascii') !== 'glTF') throw new Error('Invalid GLB magic');
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) throw new Error(`GLB length mismatch: ${declaredLength} != ${buffer.length}`);
  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
  return JSON.parse(buffer.subarray(20, 20 + jsonChunkLength).toString('utf8').trim());
}

function triangleCount(json) {
  return (json.meshes ?? []).reduce(
    (meshTotal, mesh) =>
      meshTotal +
      (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
        if ((primitive.mode ?? 4) !== 4) return primitiveTotal;
        const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
        const count = json.accessors?.[accessorIndex]?.count ?? 0;
        return primitiveTotal + Math.floor(count / 3);
      }, 0),
    0,
  );
}

const rows = [];
for (const path of modelPaths) {
  const buffer = await readFile(path);
  const json = parseGlbJson(buffer);
  rows.push({
    file: path.split('/').at(-1),
    kilobytes: Number((buffer.length / 1024).toFixed(1)),
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    primitives: (json.meshes ?? []).reduce((total, mesh) => total + (mesh.primitives?.length ?? 0), 0),
    triangles: triangleCount(json),
    materials: json.materials?.length ?? 0,
    animations: json.animations?.length ?? 0,
    animationNames: (json.animations ?? []).map((animation) => animation.name || '(unnamed)').join(', '),
    skins: json.skins?.length ?? 0,
  });
}

console.table(rows);

try {
  const files = await readdir('dist/client/_next/static/chunks');
  const threeChunk = files.find((name) => name.startsWith('halloween-three-scene-') && name.endsWith('.js'));
  if (threeChunk) {
    const buffer = await readFile(`dist/client/_next/static/chunks/${threeChunk}`);
    const { gzipSync } = await import('node:zlib');
    console.log(`Lazy 3D JS: ${(buffer.length / 1024).toFixed(1)} KB raw / ${(gzipSync(buffer).length / 1024).toFixed(1)} KB gzip`);
  }
} catch {
  console.log('Build output unavailable; run the production build before bundle reporting.');
}
