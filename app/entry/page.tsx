import { redirect } from "next/navigation";

export const revalidate = 3600;

export const metadata = {
  title: "HOSAGA",
};

export default function EntryPage() {
  redirect("/match");
}
