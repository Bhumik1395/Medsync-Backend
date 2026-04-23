import { verifyToken } from "../services/authService.js";

export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");

    try {
      const payload = verifyToken(token);
      req.user = {
        email: payload.email,
        id: payload.sub,
        name: payload.name,
        role: payload.role,
        token
      };
    } catch (_error) {
      req.user = undefined;
    }
  }

  next();
}
