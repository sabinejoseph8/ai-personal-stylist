// A setting for the project's scripts: from the environment first (Vercel, GitHub), then from
// .env.local on this computer. Values are never printed.
import { existsSync, readFileSync } from "node:fs";

export function setting(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

/** Like setting(), but stops with a clear message when the value is missing. */
export function requiredSetting(name) {
  const value = setting(name);
  if (!value) throw new Error(`${name} is missing: set it in the environment or in .env.local`);
  return value;
}
