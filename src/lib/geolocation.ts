export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string; // 逆地理编码后的地址
}

/**
 * 格式化 GPS 坐标为字符串（简短版，用于显示）
 */
export function formatGpsLocation(location: GpsLocation): string {
  // 优先显示地址，如果有的话
  if (location.address) {
    return location.address;
  }
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);
  const accuracy = location.accuracy ? ` ±${Math.round(location.accuracy)}m` : "";
  return `${lat}, ${lon}${accuracy}`;
}

/**
 * 格式化 GPS 坐标为完整显示（地址 + 坐标 + 精度）
 * 用于 tooltip 等需要详细信息的场景
 */
export function formatGpsLocationFull(location: GpsLocation): string {
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);
  const coords = `坐标: ${lat}, ${lon}`;
  const accuracy = location.accuracy 
    ? `精度: ±${Math.round(location.accuracy)}m` 
    : "";
  
  const parts: string[] = [];
  if (location.address) {
    parts.push(`地址: ${location.address}`);
  }
  parts.push(coords);
  if (accuracy) {
    parts.push(accuracy);
  }
  
  return parts.join("\n");
}

/**
 * 逆地理编码：将坐标转换为地址
 * 使用 Nominatim (OpenStreetMap) 免费 API
 * zoom=18 获取最详细的地址信息
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=zh-CN,zh,en`,
      {
        headers: {
          "User-Agent": "ACGN-Flow/1.0", // Nominatim 要求提供 User-Agent
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    
    if (!data.address) return null;

    // 构建详细地址字符串
    const addr = data.address;
    const parts: string[] = [];

    // 国家
    if (addr.country) parts.push(addr.country);
    // 省/州
    if (addr.state || addr.province) parts.push(addr.state || addr.province);
    // 城市
    if (addr.city || addr.town || addr.municipality || addr.village) {
      parts.push(addr.city || addr.town || addr.municipality || addr.village);
    }
    // 区/县
    if (addr.district || addr.county) {
      parts.push(addr.district || addr.county);
    }
    // 街道/乡镇
    if (addr.suburb || addr.neighbourhood || addr.quarter) {
      parts.push(addr.suburb || addr.neighbourhood || addr.quarter);
    }
    // 街道名
    if (addr.road || addr.street) {
      parts.push(addr.road || addr.street);
    }
    // 门牌号
    if (addr.house_number) {
      parts.push(addr.house_number + "号");
    }
    // 建筑物/POI 名称
    if (addr.building || addr.amenity || addr.shop || addr.office || addr.leisure || addr.tourism) {
      parts.push(addr.building || addr.amenity || addr.shop || addr.office || addr.leisure || addr.tourism);
    }

    // 如果解析出的部分少于 3 个，尝试使用 display_name
    if (parts.length < 3 && data.display_name) {
      // display_name 格式: "建筑, 街道, 区, 市, 省, 国家"
      // 取前 6 个部分并反转顺序（从大到小）
      const displayParts = data.display_name.split(",").map((s: string) => s.trim()).slice(0, 6).reverse();
      // 去重（避免重复显示相同层级）
      const uniqueParts = displayParts.filter((part: string, index: number, arr: string[]) => 
        arr.indexOf(part) === index && part.length > 0
      );
      return uniqueParts.join(" ");
    }

    // 去重（有时候不同字段可能有相同值）
    const uniqueParts = parts.filter((part, index, arr) => arr.indexOf(part) === index);
    return uniqueParts.length > 0 ? uniqueParts.join(" ") : null;
  } catch {
    return null;
  }
}

/**
 * 获取 GPS 位置（带可选的逆地理编码）
 */
export async function getGpsLocation(options?: { 
  reverseGeocode?: boolean;
  timeout?: number;
}): Promise<GpsLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  const { reverseGeocode: doReverseGeocode = false, timeout = 5000 } = options || {};

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location: GpsLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        // 如果需要逆地理编码
        if (doReverseGeocode) {
          const address = await reverseGeocode(location.latitude, location.longitude);
          if (address) {
            location.address = address;
          }
        }

        resolve(location);
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 60000,
      }
    );
  });
}
