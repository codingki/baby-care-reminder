import { redirect } from "next/navigation";

export default function WeightRedirect() {
  redirect("/?log=weight");
}