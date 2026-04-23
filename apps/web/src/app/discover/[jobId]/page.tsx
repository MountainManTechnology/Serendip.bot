import type { Metadata } from "next";
import type { Mood } from "@serendip-bot/types";
import DiscoverSession from "@/components/discovery/DiscoverSession";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DiscoverJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ mood?: string }>;
}) {
  const { jobId } = await params;
  const { mood } = await searchParams;
  return (
    <DiscoverSession jobId={jobId} initialMood={(mood as Mood) ?? "wonder"} />
  );
}
