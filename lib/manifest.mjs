import { readFile } from 'node:fs/promises';

export async function loadManifest(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('samples/manifest.json must contain an array');
  const ids = new Set();
  return parsed.map((sample) => {
    for (const key of ['id', 'title', 'speaker', 'source', 'question', 'file']) {
      if (typeof sample[key] !== 'string' || !sample[key]) throw new Error(`Sample is missing ${key}`);
    }
    if (!/^[a-z0-9_-]+$/i.test(sample.id) || ids.has(sample.id)) throw new Error(`Invalid or duplicate sample id: ${sample.id}`);
    ids.add(sample.id);
    return { role: 'before', ...sample };
  });
}
