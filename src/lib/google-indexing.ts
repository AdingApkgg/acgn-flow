import { env } from "@/env";
import { SignJWT, importPKCS8 } from "jose";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters";

// 缓存 access token
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 获取 Google OAuth2 access token (使用服务账号)
 */
async function getAccessToken(): Promise<string | null> {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    return null;
  }

  // 检查缓存
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    
    // 处理私钥格式（环境变量中的 \n 需要转换）
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const key = await importPKCS8(formattedKey, "RS256");

    // 创建 JWT
    const jwt = await new SignJWT({
      iss: email,
      scope: SCOPE,
      aud: GOOGLE_TOKEN_URL,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    // 换取 access token
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      console.error("Google OAuth 失败:", await response.text());
      return null;
    }

    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  } catch (error) {
    console.error("获取 Google access token 失败:", error);
    return null;
  }
}

/**
 * 通知 Google Search Console 重新抓取 sitemap
 * 使用 Search Console API 提交 sitemap
 */
export async function submitSitemapToGoogle(): Promise<boolean> {
  const token = await getAccessToken();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  
  if (!token || !appUrl) {
    return false;
  }

  try {
    // URL 编码站点地址
    const siteUrl = encodeURIComponent(appUrl);
    const sitemapUrl = encodeURIComponent(`${appUrl}/sitemap.xml`);
    
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/sitemaps/${sitemapUrl}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok || response.status === 204) {
      console.log("Google Search Console: Sitemap 提交成功");
      return true;
    } else {
      const error = await response.text();
      console.error(`Google Search Console 失败: ${error}`);
      return false;
    }
  } catch (error) {
    console.error("Google Search Console 出错:", error);
    return false;
  }
}

/**
 * 检查 Google Search Console API 是否已配置
 */
export function isGoogleConfigured(): boolean {
  return !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}
