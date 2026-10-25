#!/usr/bin/env bash
# 把已有上传复制到空的应用卷，源目录只读，目标使用原容器 UID/GID。
set -euo pipefail

upload_volume="${1:-acgn-flow-uploads}"
upload_source="${2:-./uploads}"
test -d "$upload_source" || { echo "源上传目录不存在" >&2; exit 1; }
upload_source_abs="$(cd "$upload_source" && pwd -P)"
runtime="docker"
command -v docker >/dev/null 2>&1 || runtime="podman"
command -v "$runtime" >/dev/null 2>&1 || { echo "未找到容器运行时" >&2; exit 1; }

"$runtime" volume create "$upload_volume" >/dev/null
"$runtime" run --rm --user 0:0 \
  -v "$upload_volume:/dest" \
  -v "$upload_source_abs:/src:ro" \
  alpine:3.22 sh -eu -c '
    test -z "$(ls -A /dest)" || { echo "目标卷非空，拒绝覆盖现有上传" >&2; exit 1; }
    cp -a /src/. /dest/
    chown -R 1001:1001 /dest
  '
echo "上传复制完成，原目录保持不变。"
