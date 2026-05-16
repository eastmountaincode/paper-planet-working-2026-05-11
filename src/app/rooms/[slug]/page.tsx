import { redirect } from "next/navigation";
import { sceneSlugs } from "@/lib/scenes";

type RoomPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return sceneSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RoomPageProps) {
  await params;

  return {
    title: "Paper Planet",
  };
}

export default function RoomPage() {
  redirect("/");
}
