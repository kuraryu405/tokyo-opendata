import { redirect } from "next/navigation";
import { resolveUserAppUrl } from "../../src/user-url";

export default function UserAppRedirectPage() {
  redirect(resolveUserAppUrl(process.env.USER_APP_URL));
}
