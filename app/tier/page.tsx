import { TierPageView } from "./TierPageView";

export const revalidate = 60;

export default async function TierPage() {
  return <TierPageView />;
}
