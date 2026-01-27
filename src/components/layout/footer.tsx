import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t bg-card/50">
      <div className="container py-8 md:py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-1 font-bold text-xl group">
              <span className="text-gradient-anime">ACGN</span>
              <span className="group-hover:text-primary transition-colors">Flow</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              ACGN Fans 流式媒体内容分享平台
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">导航</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  首页
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-foreground transition-colors">
                  分类
                </Link>
              </li>
              <li>
                <Link href="/tags" className="hover:text-foreground transition-colors">
                  标签
                </Link>
              </li>
              <li>
                <Link href="/search" className="hover:text-foreground transition-colors">
                  搜索
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">功能</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/upload" className="hover:text-foreground transition-colors">
                  上传视频
                </Link>
              </li>
              <li>
                <Link href="/favorites" className="hover:text-foreground transition-colors">
                  我的收藏
                </Link>
              </li>
              <li>
                <Link href="/history" className="hover:text-foreground transition-colors">
                  观看历史
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">更多</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/comments" className="hover:text-foreground transition-colors">
                  留言板
                </Link>
              </li>
              <li>
                <Link href="/feed.xml" className="hover:text-foreground transition-colors">
                  RSS 订阅
                </Link>
              </li>
              <li>
                <a 
                  href="https://github.com/AdingApkgg/acgn-flow" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ACGN Flow. 基于 AGPLv3 开源</p>
          <div className="flex items-center gap-4">
            <Link href="/llms.txt" className="hover:text-foreground transition-colors">
              llms.txt
            </Link>
            <Link href="/sitemap.xml" className="hover:text-foreground transition-colors">
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
