const requests = new Map();

export function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 120;
  const existing = requests.get(key) || [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    return res.status(429).json({
      error: "Too many requests"
    });
  }

  recent.push(now);
  requests.set(key, recent);
  next();
}

