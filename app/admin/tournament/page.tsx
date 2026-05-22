import { isAdminWriteDisabled } from "@/lib/admin-runtime";
import { isTournamentHomeSupabaseStoreEnabled } from "@/lib/tournament-home";
import TournamentManagementClient from "./TournamentManagementClient";

export const dynamic = "force-dynamic";

export default function TournamentManagementPage() {
  const readOnly = isAdminWriteDisabled() && !isTournamentHomeSupabaseStoreEnabled();

  return <TournamentManagementClient readOnly={readOnly} />;
}
