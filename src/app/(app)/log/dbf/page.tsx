import { redirect } from "next/navigation";

export default function DbfRedirect() {
  redirect("/?log=dbf");
}
