export function requestLogger(req, _res, next) {
  console.log(
    JSON.stringify({
      level: "info",
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    })
  );

  next();
}

