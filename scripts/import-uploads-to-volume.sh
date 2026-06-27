#!/usr/bin/env bash
# 把宿主机 ./uploads 里的历史上传文件导入到 compose 的 uploads 命名卷。
# 仅在「无损迁移」切换时使用一次。
#
# 用法: bash scripts/import-uploads-to-volume.sh [卷名] [源目录]
#   默认卷名: acgn-flow-uploads
#   默认源目录: ./uploads
set -euo pipefail

VOLUME="${1:-acgn-flow-uploads}"
SRC="${2:-./uploads}"

if [ ! -d "$SRC" ]; then
  echo "源目录不存在: $SRC" >&2
  exit 1
fi

# 选择容器运行时
if command -v docker >/dev/null 2>&1; then
  RT=docker
elif command -v podman >/dev/null 2>&1; then
  RT=podman
else
  echo "未找到 docker 或 podman" >&2
  exit 1
fi

SRC_ABS="$(cd "$SRC" && pwd)"
echo "用 $RT 将 $SRC_ABS/ 导入卷 $VOLUME ..."
"$RT" volume create "$VOLUME" >/dev/null
"$RT" run --rm \
  -v "$VOLUME":/dest \
  -v "$SRC_ABS":/src:ro \
  alpine sh -c 'cp -a /src/. /dest/ && echo "已导入 $(ls -1A /dest | wc -l) 个条目到卷 '"$VOLUME"'"'
