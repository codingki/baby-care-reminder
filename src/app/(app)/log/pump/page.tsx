import { redirect } from "next/navigation";

export default function PumpRedirect() {
  redirect("/?log=pump");
}
