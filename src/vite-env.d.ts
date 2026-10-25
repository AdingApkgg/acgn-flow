/// <reference types="vite/client" />
declare module "virtual:react-router/server-build" {
  const build: import("react-router").ServerBuild;
  export = build;
}
