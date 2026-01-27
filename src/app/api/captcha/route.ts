import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// 生成简单的数学验证码 SVG
function generateMathCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ["+", "-", "×"];
  const opIndex = Math.floor(Math.random() * 3);
  const operator = operators[opIndex];

  let answer: number;
  switch (opIndex) {
    case 0:
      answer = num1 + num2;
      break;
    case 1:
      answer = num1 - num2;
      break;
    case 2:
      answer = num1 * num2;
      break;
    default:
      answer = num1 + num2;
  }

  const text = `${num1} ${operator} ${num2} = ?`;

  // 生成 SVG
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12"];
  const bgColor = "#f5f5f5";
  const textColor = colors[Math.floor(Math.random() * colors.length)];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50">
      <rect width="150" height="50" fill="${bgColor}"/>
      <line x1="${Math.random() * 150}" y1="${Math.random() * 50}" x2="${Math.random() * 150}" y2="${Math.random() * 50}" stroke="#ddd" stroke-width="1"/>
      <line x1="${Math.random() * 150}" y1="${Math.random() * 50}" x2="${Math.random() * 150}" y2="${Math.random() * 50}" stroke="#ddd" stroke-width="1"/>
      <line x1="${Math.random() * 150}" y1="${Math.random() * 50}" x2="${Math.random() * 150}" y2="${Math.random() * 50}" stroke="#ddd" stroke-width="1"/>
      <text x="75" y="35" font-size="22" font-family="Arial, sans-serif" font-weight="bold" fill="${textColor}" text-anchor="middle">${text}</text>
    </svg>
  `.trim();

  return { svg, answer: answer.toString() };
}

export async function GET() {
  try {
    const { svg, answer } = generateMathCaptcha();

    // 将答案存储到 cookie 中
    const cookieStore = await cookies();
    cookieStore.set("captcha", answer, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 5, // 5 分钟有效
      path: "/",
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Captcha generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate captcha" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { captcha } = await request.json();
    const cookieStore = await cookies();
    const storedCaptcha = cookieStore.get("captcha")?.value;

    if (!storedCaptcha) {
      return NextResponse.json(
        { valid: false, message: "验证码已过期" },
        { status: 400 }
      );
    }

    const isValid = captcha?.toString().trim() === storedCaptcha;

    if (isValid) {
      // 验证成功后删除 cookie
      cookieStore.delete("captcha");
    }

    return NextResponse.json({
      valid: isValid,
      message: isValid ? "验证成功" : "验证码错误",
    });
  } catch {
    return NextResponse.json(
      { valid: false, message: "验证失败" },
      { status: 500 }
    );
  }
}
