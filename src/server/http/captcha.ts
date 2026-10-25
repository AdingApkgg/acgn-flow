import { randomInt, randomUUID } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { redis } from "@/lib/redis";

const captchaCookie = "acgn-captcha";
const captchaKey = (id: string) => `captcha:challenge:${id}`;
function readChallenge(headers: Headers) {
  const value = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${captchaCookie}=`))
    ?.slice(captchaCookie.length + 1);
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

// 登录动作原子消费挑战；答案错误也需要刷新，避免对同一挑战暴力穷举。
export async function consumeCaptcha(headers: Headers, answer: string): Promise<boolean> {
  const id = readChallenge(headers);
  if (!id) return false;
  const expected = await redis.getdel(captchaKey(id));
  return expected !== null && expected === answer.trim();
}

export async function captchaGet(c: Context) {
  const previous = getCookie(c, captchaCookie);
  if (previous && /^[0-9a-f-]{36}$/.test(previous)) await redis.del(captchaKey(previous));
  const first = randomInt(1, 11);
  const second = randomInt(1, 11);
  const operator = randomInt(0, 3);
  const answer = operator === 0 ? first + second : operator === 1 ? first - second : first * second;
  const id = randomUUID();
  await redis.set(captchaKey(id), String(answer), "EX", 300);
  setCookie(c, captchaCookie, id, {
    httpOnly: true,
    secure: new URL(process.env.APP_URL || c.req.url).protocol === "https:",
    sameSite: "Strict",
    maxAge: 300,
    path: "/",
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><rect width="150" height="50" fill="#f5f5f5"/><path d="M0 12L150 39M0 38L150 9" stroke="#ddd"/><text x="75" y="35" font-size="22" font-family="Arial,sans-serif" font-weight="bold" fill="#6366f1" text-anchor="middle">${first} ${["+", "-", "×"][operator]} ${second} = ?</text></svg>`;
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
}

// 保留原预检资源路径，但预检不会消费挑战，最终消费只在登录动作执行。
export async function captchaPost(c: Context) {
  const { captcha } = await c.req.json();
  const id = readChallenge(c.req.raw.headers);
  const expected = id ? await redis.get(captchaKey(id)) : null;
  const valid = expected !== null && String(captcha ?? "").trim() === expected;
  return c.json({ valid, message: valid ? "验证成功" : "验证码错误或已过期" }, valid ? 200 : 400);
}
