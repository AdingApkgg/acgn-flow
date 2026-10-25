import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("app/page.tsx"),
  route("search", "app/search/page.tsx"),
  route("tags", "app/tags/page.tsx"),
  route("tag/:slug", "app/tag/[slug]/page.tsx"),
  route("video/:id", "app/video/[id]/page.tsx"),
  route("user/:id", "app/user/[id]/page.tsx"),
  route("comments", "app/comments/page.tsx"),
  route("login", "app/(auth)/login/page.tsx"),
  route("register", "app/(auth)/register/page.tsx"),
  route("forgot-password", "app/(auth)/forgot-password/page.tsx"),
  layout("routes/authenticated.tsx", [
    route("upload", "app/upload/page.tsx"),
    route("video/edit/:id", "app/video/edit/[id]/page.tsx"),
    route("my-videos", "app/my-videos/page.tsx"),
    route("favorites", "app/favorites/page.tsx"),
    route("history", "app/history/page.tsx"),
    route("profile", "app/profile/page.tsx"),
    route("settings", "app/settings/layout.tsx", [
      index("app/settings/page.tsx"),
      route("account", "app/settings/account/page.tsx"),
      route("connections", "app/settings/connections/page.tsx"),
      route("sessions", "app/settings/sessions/page.tsx"),
      route("danger", "app/settings/danger/page.tsx"),
    ]),
    route("dashboard", "app/dashboard/layout.tsx", [
      index("app/dashboard/page.tsx"),
      route("users", "app/dashboard/users/page.tsx"),
      route("videos", "app/dashboard/videos/page.tsx"),
      route("tags", "app/dashboard/tags/page.tsx"),
      route("comments", "app/dashboard/comments/page.tsx"),
      route("settings", "app/dashboard/settings/page.tsx"),
    ]),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
