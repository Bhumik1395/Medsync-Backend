import dotenv from "dotenv";

dotenv.config();

function requireEnv(name, fallback = "") {
  const value = process.env[name] ?? fallback;

  if (!value && fallback === "") {
    return "";
  }

  return value;
}

export const env = {
 
  apiPort: Number(process.env.PORT || process.env.API_PORT || 4000),
  jwtSecret: requireEnv("JWT_SECRET"),
  openAiApiKey: requireEnv("OPENAI_API_KEY"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
};
