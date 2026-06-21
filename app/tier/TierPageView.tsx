import { getUniversityOptionsFromDB } from "@/lib/university-metadata";

import { TierClientView } from "./TierClientView";

export type TierPageParams = {
  search?: string;
  race?: string;
  univ?: string;
  tier?: string;
  raceToggle?: string;
  liveOnly?: string;
};

export async function TierPageView({ params = {} }: { params?: TierPageParams } = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params).reduce<[string, string][]>((entries, [key, value]) => {
      if (typeof value === "string" && value.trim()) {
        entries.push([key, value.trim()]);
      }
      return entries;
    }, [])
  ).toString();

  return <TierClientView queryString={queryString} universityOptions={await getUniversityOptionsFromDB()} />;
}
