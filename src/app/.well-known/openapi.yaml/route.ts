import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  const openapi = `openapi: 3.1.0
info:
  title: ${siteName} API
  description: |
    ${siteName} 是一个 ACGN（动画、漫画、游戏、轻小说）流式媒体内容分享平台。
    
    本 API 文档描述了网站的公开端点和数据结构，主要用于 AI 代理和搜索引擎理解网站内容。
    
    ## 主要功能
    - 浏览 ACGN 相关视频内容
    - 按标签分类查找视频
    - 查看用户主页和上传内容
    - 搜索视频
    
    ## 数据源
    - RSS Feed: ${baseUrl}/feed.xml
    - Sitemap: ${baseUrl}/sitemap.xml
    - LLMs.txt: ${baseUrl}/llms.txt
  version: 1.0.0
  contact:
    email: contact@saop.cc
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: ${baseUrl}
    description: Production server

paths:
  /:
    get:
      operationId: getHomepage
      summary: 首页
      description: 获取网站首页，展示最新和热门视频
      responses:
        '200':
          description: HTML 页面
          content:
            text/html:
              schema:
                type: string

  /video/{id}:
    get:
      operationId: getVideo
      summary: 视频详情页
      description: 获取单个视频的详细信息，包括标题、描述、上传者、标签等
      parameters:
        - name: id
          in: path
          required: true
          description: 视频唯一标识符
          schema:
            type: string
      responses:
        '200':
          description: 视频详情页面
          content:
            text/html:
              schema:
                type: string
        '404':
          description: 视频不存在

  /tag/{slug}:
    get:
      operationId: getTagVideos
      summary: 标签视频列表
      description: 获取特定标签下的所有视频
      parameters:
        - name: slug
          in: path
          required: true
          description: 标签 slug
          schema:
            type: string
      responses:
        '200':
          description: 标签页面
          content:
            text/html:
              schema:
                type: string

  /user/{id}:
    get:
      operationId: getUserProfile
      summary: 用户主页
      description: 获取用户的公开资料和上传的视频
      parameters:
        - name: id
          in: path
          required: true
          description: 用户唯一标识符
          schema:
            type: string
      responses:
        '200':
          description: 用户主页
          content:
            text/html:
              schema:
                type: string

  /search:
    get:
      operationId: searchVideos
      summary: 搜索视频
      description: 根据关键词搜索视频
      parameters:
        - name: q
          in: query
          required: false
          description: 搜索关键词
          schema:
            type: string
      responses:
        '200':
          description: 搜索结果页面
          content:
            text/html:
              schema:
                type: string

  /tags:
    get:
      operationId: getAllTags
      summary: 标签列表
      description: 获取所有可用标签
      responses:
        '200':
          description: 标签列表页面
          content:
            text/html:
              schema:
                type: string

  /feed.xml:
    get:
      operationId: getRssFeed
      summary: RSS Feed
      description: 获取最新视频的 RSS 订阅源
      responses:
        '200':
          description: RSS XML
          content:
            application/rss+xml:
              schema:
                type: string

  /sitemap.xml:
    get:
      operationId: getSitemap
      summary: Sitemap
      description: 获取网站地图
      responses:
        '200':
          description: Sitemap XML
          content:
            application/xml:
              schema:
                type: string

  /llms.txt:
    get:
      operationId: getLlmsTxt
      summary: LLMs.txt
      description: AI 友好的网站描述文件
      responses:
        '200':
          description: 纯文本描述
          content:
            text/plain:
              schema:
                type: string

components:
  schemas:
    Video:
      type: object
      description: 视频对象
      properties:
        id:
          type: string
          description: 唯一标识符
        title:
          type: string
          description: 视频标题
        description:
          type: string
          nullable: true
          description: 视频描述
        coverUrl:
          type: string
          nullable: true
          description: 封面图片 URL
        videoUrl:
          type: string
          description: 视频播放 URL
        duration:
          type: integer
          nullable: true
          description: 视频时长（秒）
        views:
          type: integer
          description: 观看次数
        createdAt:
          type: string
          format: date-time
          description: 创建时间
        uploader:
          $ref: '#/components/schemas/User'
        tags:
          type: array
          items:
            $ref: '#/components/schemas/Tag'

    User:
      type: object
      description: 用户对象
      properties:
        id:
          type: string
          description: 唯一标识符
        username:
          type: string
          description: 用户名
        nickname:
          type: string
          nullable: true
          description: 昵称
        avatar:
          type: string
          nullable: true
          description: 头像 URL
        bio:
          type: string
          nullable: true
          description: 个人简介

    Tag:
      type: object
      description: 标签对象
      properties:
        id:
          type: string
          description: 唯一标识符
        name:
          type: string
          description: 标签名称
        slug:
          type: string
          description: URL 友好的标识符
`;

  return new NextResponse(openapi, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
