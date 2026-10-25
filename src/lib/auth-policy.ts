/** 登录后只允许回到当前站点的相对路径。 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    Array.from(value).some(
      (character) =>
        character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    return "/";
  }
  return value;
}

/** 数据库会话与审计撤销状态共同生效，旧 JWT 不参与判定。 */
export function sessionIsUsable(
  value: { expiresAt: Date; isBanned: boolean; isRevoked: boolean },
  now = new Date(),
): boolean {
  return !value.isBanned && !value.isRevoked && value.expiresAt.getTime() > now.getTime();
}
