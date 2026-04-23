import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const fallbackSecret = "medsync-dev-secret";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    env.jwtSecret || fallbackSecret,
    {
      expiresIn: "12h"
    }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret || fallbackSecret);
}
