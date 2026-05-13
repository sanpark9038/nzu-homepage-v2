import { TierPageView, type TierPageParams } from "../TierPageView";

export default async function TierQueryPage({
  searchParams,
}: {
  searchParams: Promise<TierPageParams>;
}) {
  const params = await searchParams;

  return <TierPageView params={params} />;
}
