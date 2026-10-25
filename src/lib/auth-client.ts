import {
  inferAdditionalFields,
  multiSessionClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";
import { safeCallbackPath } from "./auth-policy";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields<typeof auth>(),
    usernameClient({ displayUsername: false }),
    multiSessionClient(),
  ],
});

/** 将认证状态适配到现有组件，数据与刷新均由 Better Auth 维护。 */
export function useSession() {
  const result = authClient.useSession();
  const data = result.data
    ? {
        ...result.data,
        jti: result.data.session.id,
      }
    : null;
  return {
    data,
    status: result.isPending
      ? ("loading" as const)
      : data
        ? ("authenticated" as const)
        : ("unauthenticated" as const),
    update: () => result.refetch(),
  };
}

type SignInOptions = {
  identifier?: string;
  password?: string;
  captcha?: string;
  callbackUrl?: string;
  redirect?: boolean;
};

export async function signIn(provider: string, options: SignInOptions = {}) {
  const callbackURL = safeCallbackPath(options.callbackUrl);
  if (provider === "credentials") {
    const identifier = options.identifier || "";
    const password = options.password || "";
    const requestOptions = { headers: { "x-captcha-answer": options.captcha || "" } };
    const result = await authClient.signIn.username(
      { username: identifier, password },
      requestOptions,
    );
    if (result.error) return { error: result.error.message || "账号或密码错误", ok: false };
    if (options.redirect !== false) window.location.assign(callbackURL);
    return { error: null, ok: true };
  }
  if (!["github", "google", "discord"].includes(provider)) {
    return { error: "不支持的登录方式", ok: false };
  }
  const result = await authClient.signIn.social({ provider, callbackURL });
  return { error: result.error?.message || null, ok: !result.error };
}

export async function signOut(options?: { callbackUrl?: string }) {
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message || "退出登录失败");
  window.location.assign(safeCallbackPath(options?.callbackUrl));
}
