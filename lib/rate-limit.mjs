export function createRateLimiter({ perIp = 20, globalPerDay = 300, hourMs = 60 * 60 * 1000, dayMs = 24 * 60 * 60 * 1000, now = Date.now } = {}) {
  const ipBuckets = new Map();
  let globalBucket = { start: now(), count: 0 };
  let checks = 0;

  function consume(ip = 'unknown') {
    const time = now();
    if (time - globalBucket.start >= dayMs) globalBucket = { start: time, count: 0 };
    let bucket = ipBuckets.get(ip);
    if (!bucket || time - bucket.start >= hourMs) bucket = { start: time, count: 0 };
    if (++checks % 128 === 0) {
      for (const [key, item] of ipBuckets) if (time - item.start >= hourMs) ipBuckets.delete(key);
    }
    if (globalBucket.count >= globalPerDay) return { allowed: false, message: 'The lair is taking a breather today. Please try again tomorrow.' };
    if (bucket.count >= perIp) return { allowed: false, message: 'That goblin has had enough for now. Please try again in about an hour.' };
    bucket.count++;
    ipBuckets.set(ip, bucket);
    globalBucket.count++;
    return { allowed: true, remaining: Math.min(perIp - bucket.count, globalPerDay - globalBucket.count) };
  }
  return { consume };
}

export function requestIp(request) {
  const rawFlyIp = request.headers?.['fly-client-ip'];
  const flyIp = (Array.isArray(rawFlyIp) ? rawFlyIp[0] : rawFlyIp)?.trim();
  if (flyIp) return flyIp;
  const forwarded = request.headers?.['x-forwarded-for'];
  const lastForwarded = Array.isArray(forwarded) ? forwarded.at(-1)?.split(',').at(-1)?.trim() : forwarded?.split(',').at(-1)?.trim();
  return lastForwarded || request.socket?.remoteAddress || 'unknown';
}
