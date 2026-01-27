import { redirect } from "next/navigation";

// 设置页面已移至设置面板（右上角），账号绑定已移至个人信息页面
export default function SettingsPage() {
  redirect("/profile");
}
