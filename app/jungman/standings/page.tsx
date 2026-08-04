import { redirect } from "next/navigation";

// 순위표는 /jungman 한 장으로 합쳤다 — 밖에 뿌려진 옛 링크만 여기서 받아 넘긴다
export default function JungmanStandingsPage() {
  redirect("/jungman");
}
