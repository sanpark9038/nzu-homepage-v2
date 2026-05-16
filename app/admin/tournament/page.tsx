import { isAdminWriteDisabled } from "@/lib/admin-runtime";
import TournamentManagementClient from "./TournamentManagementClient";

export const dynamic = "force-dynamic";

export default function TournamentManagementPage() {
  const readOnly = isAdminWriteDisabled();

  return <TournamentManagementClient readOnly={readOnly} />;
}
