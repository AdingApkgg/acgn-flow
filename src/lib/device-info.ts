import { UAParser } from "ua-parser-js";

export interface DeviceInfo {
  deviceType: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  brand: string | null;
  model: string | null;
  platform: string | null;
  language: string | null;
  timezone: string | null;
  screen: string | null;
  pixelRatio: number | null;
  userAgent: string | null;
  fingerprint: string;
}

// User-Agent Client Hints API types
interface NavigatorUAData {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<HighEntropyValues>;
}

interface HighEntropyValues {
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  model?: string;
  uaFullVersion?: string;
  fullVersionList?: Array<{ brand: string; version: string }>;
  bitness?: string;
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

/**
 * 获取高精度设备信息（使用 User-Agent Client Hints API）
 * 
 * 注意：
 * - Chrome 90+ 支持此 API，可获取真实的 OS 版本（如 macOS 26.2.0）
 * - Safari 和 Firefox 不支持此 API，会回退到 User-Agent 解析
 * - User-Agent 字符串中的 macOS 版本被冻结在 10.15.7，但 Client Hints 返回真实版本
 */
export async function getHighEntropyDeviceInfo(): Promise<Partial<DeviceInfo>> {
  if (typeof navigator === "undefined" || !navigator.userAgentData) {
    console.log("[DeviceInfo] userAgentData not available");
    return {};
  }

  try {
    const hints = await navigator.userAgentData.getHighEntropyValues([
      "platform",
      "platformVersion",
      "architecture",
      "model",
      "fullVersionList",
      "bitness",
    ]);

    console.log("[DeviceInfo] High entropy hints:", hints);

    const platform = hints.platform || navigator.userAgentData.platform;
    const osVersion = hints.platformVersion || null;

    // 获取主浏览器版本（排除 "Not A;Brand" 等占位符）
    const browserInfo = hints.fullVersionList?.find(
      (b) => !b.brand.includes("Not") && !b.brand.includes("Chromium")
    );

    const result = {
      os: platform,
      osVersion,
      browser: browserInfo?.brand || null,
      browserVersion: browserInfo?.version || null,
      model: hints.model || null,
    };

    console.log("[DeviceInfo] High entropy result:", result);
    return result;
  } catch (error) {
    console.error("[DeviceInfo] Failed to get high entropy values:", error);
    return {};
  }
}

/**
 * 解析设备信息（基于 User-Agent 字符串）
 * 服务端和客户端都可使用，但精度有限
 */
export function parseDeviceInfo(userAgent: string | null, extra?: Partial<DeviceInfo>): DeviceInfo {
  const parser = new UAParser(userAgent || undefined);
  const result = parser.getResult();

  const deviceType = result.device.type || "desktop";
  const os = result.os.name || null;
  const osVersion = result.os.version || null;
  const browser = result.browser.name || null;
  const browserVersion = result.browser.version || null;
  const brand = result.device.vendor || null;
  const model = result.device.model || null;

  const fingerprintParts = [
    deviceType,
    os,
    osVersion,
    browser,
    browserVersion,
    brand,
    model,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  const fingerprint = fingerprintParts || "unknown";

  return {
    deviceType,
    os,
    osVersion,
    browser,
    browserVersion,
    brand,
    model,
    platform: extra?.platform ?? null,
    language: extra?.language ?? null,
    timezone: extra?.timezone ?? null,
    screen: extra?.screen ?? null,
    pixelRatio: extra?.pixelRatio ?? null,
    userAgent: userAgent || null,
    fingerprint,
  };
}

/**
 * 合并高精度设备信息到基础设备信息
 */
export function mergeDeviceInfo(base: DeviceInfo, highEntropy: Partial<DeviceInfo>): DeviceInfo {
  const merged = {
    ...base,
    os: highEntropy.os || base.os,
    osVersion: highEntropy.osVersion || base.osVersion,
    browser: highEntropy.browser || base.browser,
    browserVersion: highEntropy.browserVersion || base.browserVersion,
    model: highEntropy.model || base.model,
    // 重新计算 fingerprint
    fingerprint: [
      base.deviceType,
      highEntropy.os || base.os,
      highEntropy.osVersion || base.osVersion,
      highEntropy.browser || base.browser,
      highEntropy.browserVersion || base.browserVersion,
      base.brand,
      highEntropy.model || base.model,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase() || "unknown",
  };

  console.log("[DeviceInfo] Merged info:", {
    baseOs: base.os,
    baseOsVersion: base.osVersion,
    highEntropyOs: highEntropy.os,
    highEntropyOsVersion: highEntropy.osVersion,
    finalOs: merged.os,
    finalOsVersion: merged.osVersion,
  });

  return merged;
}

// ==================== 服务端设备信息处理 ====================

/**
 * 客户端提交的设备信息（来自 API 请求）
 */
export interface ClientDeviceInput {
  userAgent?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  cookiesEnabled?: boolean;
  doNotTrack?: boolean;
  touchSupport?: boolean;
  colorDepth?: number;
  deviceMemory?: number | null;
  hardwareConcurrency?: number | null;
  connectionType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracy?: number | null;
}

/**
 * 规范化的设备信息（用于数据库存储）
 */
export interface NormalizedDeviceInfo {
  deviceType: string;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  brand: string | null;
  model: string | null;
  screen: string | null;
  timezone: string | null;
  language: string | null;
  fingerprint: string;
}

/**
 * 位置信息（用于数据库存储）
 */
export interface LocationInfo {
  ipv4: string | null;
  ipv6: string | null;
  ipv4Location: string | null;
  ipv6Location: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
}

/**
 * 规范化客户端提交的设备信息
 * 用于 comment.ts, guestbook.ts, user.ts 等多处重复使用的逻辑
 */
export function normalizeDeviceInfo(
  input: ClientDeviceInput | undefined,
  headerUserAgent?: string
): NormalizedDeviceInfo {
  const userAgent = input?.userAgent || headerUserAgent || "";
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const deviceType = result.device.type || "desktop";
  const os = result.os.name || null;
  const osVersion = result.os.version || null;
  const browser = result.browser.name || null;
  const browserVersion = result.browser.version || null;
  const brand = result.device.vendor || null;
  const model = result.device.model || null;

  const fingerprintParts = [
    deviceType,
    os,
    osVersion,
    browser,
    browserVersion,
    brand,
    model,
    input?.screenResolution,
    input?.timezone,
    input?.language,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  return {
    deviceType,
    os,
    osVersion,
    browser,
    browserVersion,
    brand,
    model,
    screen: input?.screenResolution || null,
    timezone: input?.timezone || null,
    language: input?.language || null,
    fingerprint: fingerprintParts || "unknown",
  };
}

/**
 * 创建位置信息对象
 * 注意：IP 位置需要在服务端使用 getIpLocation 获取后传入
 */
export function createLocationInfo(
  ipv4: string | null,
  ipv6: string | null,
  ipv4Location: string | null,
  ipv6Location: string | null,
  gpsData?: { latitude?: number | null; longitude?: number | null; accuracy?: number | null }
): LocationInfo {
  return {
    ipv4,
    ipv6,
    ipv4Location,
    ipv6Location,
    gpsLatitude: gpsData?.latitude ?? null,
    gpsLongitude: gpsData?.longitude ?? null,
    gpsAccuracy: gpsData?.accuracy ?? null,
  };
}

/**
 * 格式化位置字符串（用于显示）
 */
export function formatLocationString(location: LocationInfo): string | null {
  // 优先使用 IPv4 位置，然后是 IPv6
  return location.ipv4Location || location.ipv6Location || null;
}
