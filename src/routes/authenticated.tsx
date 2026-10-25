import { type LoaderFunctionArgs, Outlet } from "react-router";
import { requireUser } from "./data.server";
export async function loader(args: LoaderFunctionArgs) {
  await requireUser(args);
  return null;
}
export default function AuthenticatedLayout() {
  return <Outlet />;
}
