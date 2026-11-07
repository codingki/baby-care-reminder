import { redirect } from "next/navigation";

export default function DiaperRedirect() {
  redirect("/?log=diaper");
}
